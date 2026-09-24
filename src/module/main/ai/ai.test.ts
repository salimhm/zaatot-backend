import { describe, expect, it, mock, spyOn } from 'bun:test'
import type { type_schema_agent_dispatcher_input } from '@agent/dispatcher/dispatcher.schema.agent'

import { Elysia } from 'elysia'

import { ai_request_timeout_seconds, ai_workflow_timeout_ms } from '@ai/runtime.ai'
import { run_consumer_workflow } from '@ai/workflow.ai'
import { schema_agent_conductor_result } from '@agent/conductor/conductor.schema.agent'

import { handle_error } from '@lib/error.lib'
import { lib_jwt } from '@lib/jwt.lib'

import { create_controller_ai } from '@module/main/ai/ai.controller'
import { service_ai } from '@module/main/ai/ai.service'

function app_fixture() {
  const dependency = {
    bodyguard: mock(async () => ({ safe: true, riskLevel: 'none', risks: [], action: 'allow', reason: 'Allowed', confidence: 1 })),
    conductor: mock(async () => ({ intent: 'Analyze cereal', steps: [{ agent: 'Dispatcher', purpose: 'Select checks' }] })),
    dispatcher: mock(async (input: type_schema_agent_dispatcher_input) => ({
      selected_agents: [
        { agent: 'Detective', depends_on: [], run_when: 'always' },
        { agent: 'Skeptic', depends_on: ['Detective'], run_when: 'always' },
        { agent: 'Referee', depends_on: ['Skeptic'], run_when: 'always' },
        { agent: 'Storyteller', depends_on: ['Skeptic', 'Referee'], run_when: 'always' },
        { agent: 'Gatekeeper', depends_on: ['Storyteller'], run_when: 'always' },
      ],
      required_checks: ['identity', 'evidence', 'hard_constraints', 'final_response'],
      budgets: { ...input.budget_limits, max_alternative_candidates: 0, max_candidate_review_passes: 0 },
      untrusted_content_policy: 'bait_tester_before_consumption',
      candidate_validation: 'not_requested',
    })),
  }
  const analyze = mock<typeof service_ai.analyze>(async (body, _payload, signal) => ({
    data: await run_consumer_workflow(body, { dependency, signal }),
  }))
  const app = new Elysia()
    .onError(handle_error)
    .use(lib_jwt)
    .get('/test-token', async ({ jwt }) => jwt.sign({ user_id: 21 }))
    .get('/test-expired-token', async ({ jwt }) => jwt.sign({ user_id: 21, exp: 1 }))
    .get('/test-invalid-identity', async ({ jwt }) => jwt.sign({ user_id: -1 }))
    .use(create_controller_ai({ analyze }))
  const send = (authorization?: string, extra = {}) =>
    app.handle(
      new Request('http://localhost/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
        body: JSON.stringify({ prompt: 'Check this cereal', user_id: 21, ...extra }),
      }),
    )
  return { app, analyze, dependency, send }
}

describe('AI HTTP boundary', () => {
  it('rejects missing, malformed, forged and expired tokens before execution', async () => {
    const { app, send, analyze } = app_fixture()
    const expired = await (await app.handle(new Request('http://localhost/test-expired-token'))).text()
    for (const token of [undefined, 'Basic abc', 'Bearer forged', 'Bearer ' + expired]) {
      expect((await send(token)).status).toBe(401)
    }
    expect(analyze).not.toHaveBeenCalled()
  })

  it('rejects signed tokens with invalid identity', async () => {
    const { app, send, analyze } = app_fixture()
    const token = await (await app.handle(new Request('http://localhost/test-invalid-identity'))).text()
    expect((await send('Bearer ' + token)).status).toBe(401)
    expect(analyze).not.toHaveBeenCalled()
  })

  it('returns a validated startup result from the authenticated endpoint', async () => {
    const { app, send, analyze, dependency } = app_fixture()
    const token = await (await app.handle(new Request('http://localhost/test-token'))).text()
    const response = await send('Bearer ' + token)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: unknown }
    const data = schema_agent_conductor_result.parse(body.data)
    expect(data.status).toBe('partial')
    expect(Object.keys(body.data as object).sort()).toEqual(
      ['execution_id', 'status', 'product', 'assessments', 'alternatives', 'explanation', 'sources', 'limitations'].sort(),
    )
    expect(data.product).toBeNull()
    expect(data.assessments).toEqual([])
    expect(data.explanation).toBeNull()
    expect(body.data).not.toHaveProperty('bodyguard')
    expect(body.data).not.toHaveProperty('conductor')
    expect(body.data).not.toHaveProperty('dispatcher_plan')
    expect(dependency.dispatcher).toHaveBeenCalledTimes(1)
    expect(analyze.mock.calls[0]?.[1].user_id).toBe(21)
  })

  it('serializes the final aggregate from multiple agents without requiring a Bodyguard result', async () => {
    const { app, send, analyze } = app_fixture()
    const product = { barcode: '1234567890123', name: 'Example cereal', brand: 'Example' }
    const result = schema_agent_conductor_result.parse({
      execution_id: crypto.randomUUID(),
      status: 'completed',
      product,
      assessments: [
        { agent: 'Medic', status: 'completed', summary: 'Contains oats.', source_ids: ['catalog'], limitations: [] },
        { agent: 'Eco Scout', status: 'partial', summary: 'Packaging data unavailable.', source_ids: [], limitations: ['Missing packaging data'] },
      ],
      alternatives: [
        { product: { ...product, barcode: '1234567890124', name: 'Another cereal' }, reasons: ['Example reviewed reason'], source_ids: ['catalog'] },
      ],
      explanation: {
        summary: 'Example reviewed findings.',
        reasons: ['Contains oats.'],
        tradeoffs: ['Environmental evidence is incomplete.'],
        citation_ids: ['catalog'],
      },
      sources: [{ id: 'catalog', provider: 'Example catalog', url: 'https://example.com/product', retrieved_at: new Date().toISOString() }],
      limitations: ['Missing packaging data'],
    })
    analyze.mockImplementation(async () => ({ data: result }))
    const token = await (await app.handle(new Request('http://localhost/test-token'))).text()
    const response = await send('Bearer ' + token)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: result })
  })

  it('rejects another user ID before execution', async () => {
    const { app, send, analyze } = app_fixture()
    const token = await (await app.handle(new Request('http://localhost/test-token'))).text()
    expect((await send('Bearer ' + token, { user_id: 22 })).status).toBe(401)
    expect(analyze).not.toHaveBeenCalled()
  })

  it('rejects invalid prompt and user ID before agent calls', async () => {
    const { app, send, dependency } = app_fixture()
    const token = await (await app.handle(new Request('http://localhost/test-token'))).text()
    for (const extra of [{ prompt: '' }, { prompt: '   ' }, { prompt: 'x'.repeat(4001) }, { user_id: 0 }, { user_id: 1.5 }, { user_id: 'invalid' }]) {
      expect((await send('Bearer ' + token, extra)).status).toBe(422)
    }
    expect(dependency.bodyguard).not.toHaveBeenCalled()
  })

  it('keeps the AI HTTP connection open beyond the shared workflow deadline', async () => {
    const { app } = app_fixture()
    const token = await (await app.handle(new Request('http://localhost/test-token'))).text()
    app.listen({ port: 0, hostname: '127.0.0.1', idleTimeout: 1 })
    const server = app.server!
    const timeout = spyOn(server, 'timeout')
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: 'Check this cereal', user_id: 21 }),
      })
      expect(response.status).toBe(200)
      await response.json()
      expect(timeout).toHaveBeenCalledWith(expect.any(Request), ai_request_timeout_seconds)
      expect(ai_request_timeout_seconds * 1000).toBeGreaterThan(ai_workflow_timeout_ms)
      expect(ai_request_timeout_seconds).toBeLessThanOrEqual(255)
    } finally {
      timeout.mockRestore()
      await app.stop(true)
    }
  })

  it('enforces identity when the service is called directly', async () => {
    await expect(service_ai.analyze({ prompt: 'Check cereal', user_id: 2 }, { user_id: 1 })).rejects.toMatchObject({ status: 401 })
    await expect(service_ai.analyze({ prompt: 'Check cereal', user_id: 0 }, { user_id: 0 })).rejects.toMatchObject({ status: 401 })
  })
})
