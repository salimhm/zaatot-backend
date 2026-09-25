import type { type_schema_agent_bodyguard } from '@agent/bodyguard/bodyguard.schema.agent'
import type { type_schema_agent_dispatcher, type_schema_agent_dispatcher_input } from '@agent/dispatcher/dispatcher.schema.agent'
import type { consumer_dependency } from '@ai/workflow.ai'

import { describe, expect, it, mock, spyOn } from 'bun:test'

import { run_consumer_workflow } from '@ai/workflow.ai'
import { $agent_bait_tester } from '@agent/bait-tester/bait-tester.agent'
import { $agent_bodyguard } from '@agent/bodyguard/bodyguard.agent'
import { $agent_conductor } from '@agent/conductor/conductor.agent'
import { schema_agent_conductor_result } from '@agent/conductor/conductor.schema.agent'
import { $agent_detective } from '@agent/detective/detective.agent'
import { dispatcher_budget_limit } from '@agent/dispatcher/constants'
import { $agent_dispatcher } from '@agent/dispatcher/dispatcher.agent'

import { service_boycott_decision } from '@module/main/boycott-decision/boycott-decision.service'
import { service_boycott_provider } from '@module/main/boycott-provider/boycott-provider.service'

const request = { prompt: 'Check this cereal', user_id: 7 }
const allowed: type_schema_agent_bodyguard = {
  safe: true,
  riskLevel: 'none',
  risks: [],
  action: 'allow',
  reason: 'Product analysis',
  confidence: 1,
}

function dispatcher_plan_fixture(input: type_schema_agent_dispatcher_input): type_schema_agent_dispatcher {
  return {
    selected_agents: [
      { agent: 'Detective', depends_on: [], run_when: 'always' },
      { agent: 'Investigator', depends_on: ['Detective'], run_when: 'always' },
      { agent: 'Skeptic', depends_on: ['Detective', 'Investigator'], run_when: 'always' },
      { agent: 'Referee', depends_on: ['Skeptic'], run_when: 'always' },
      { agent: 'Storyteller', depends_on: ['Skeptic', 'Referee'], run_when: 'always' },
      { agent: 'Gatekeeper', depends_on: ['Storyteller'], run_when: 'always' },
    ],
    required_checks: ['identity', 'ethics', 'evidence', 'hard_constraints', 'final_response'],
    budgets: { ...input.budget_limits, max_alternative_candidates: 0, max_candidate_review_passes: 0 },
    untrusted_content_policy: 'bait_tester_before_consumption',
    candidate_validation: 'not_requested',
  }
}

function dependencies(overrides: Partial<consumer_dependency> = {}) {
  return {
    bodyguard: mock(async (_prompt: string, _signal: AbortSignal): Promise<unknown> => allowed),
    conductor: mock(
      async (prompt: string, _signal: AbortSignal): Promise<unknown> => ({
        intent: prompt,
        steps: [{ agent: 'Dispatcher', purpose: 'Route the requested product checks' }],
      }),
    ),
    dispatcher: mock(async (input: type_schema_agent_dispatcher_input, _signal: AbortSignal) => dispatcher_plan_fixture(input)),
    ...overrides,
  }
}

describe('Consumer workflow startup', () => {
  it('runs Bodyguard, Conductor and Dispatcher in order and returns only the partial analysis result', async () => {
    const order: string[] = []
    const dependency = dependencies({
      bodyguard: mock(async () => {
        order.push('Bodyguard')
        return allowed
      }),
      conductor: mock(async () => {
        order.push('Conductor')
        return { intent: 'Product analysis', steps: [{ agent: 'Dispatcher', purpose: 'Plan checks' }] }
      }),
      dispatcher: mock(async (input) => {
        order.push('Dispatcher')
        expect(input).toEqual({
          prompt: request.prompt,
          bodyguard: allowed,
          conductor_plan: { intent: 'Product analysis', steps: [{ agent: 'Dispatcher', purpose: 'Plan checks' }] },
          budget_limits: { ...dispatcher_budget_limit, timeout_ms: expect.any(Number) },
        })
        expect(input.budget_limits.timeout_ms).toBeGreaterThan(0)
        expect(input.budget_limits.timeout_ms).toBeLessThanOrEqual(dispatcher_budget_limit.timeout_ms)
        return dispatcher_plan_fixture(input)
      }),
    })
    const result = await run_consumer_workflow(request, { dependency })
    expect(schema_agent_conductor_result.safeParse(result).success).toBe(true)
    expect(result.status).toBe('partial')
    expect(result).not.toHaveProperty('user_id')
    expect(result.product).toBeNull()
    expect(result.assessments).toEqual([])
    expect(result.alternatives).toEqual([])
    expect(result.explanation).toBeNull()
    expect(result.sources).toEqual([])
    expect(result).not.toHaveProperty('bodyguard')
    expect(result).not.toHaveProperty('conductor')
    expect(result).not.toHaveProperty('dispatcher_plan')
    expect(result).not.toHaveProperty('selected_agents')
    expect(order).toEqual(['Bodyguard', 'Conductor', 'Dispatcher'])
    expect(result.limitations).toEqual(['No implemented specialist was selected for this request.'])
  })

  for (const decision of [
    { safe: false, action: 'allow', status: 'blocked' },
    { safe: true, action: 'block', status: 'blocked' },
    { safe: true, action: 'sanitize', status: 'blocked' },
    { safe: false, action: 'human_review', status: 'needs_review' },
  ] as const) {
    it(`stops when safe=${decision.safe} and action=${decision.action}`, async () => {
      const dependency = dependencies({ bodyguard: mock(async () => ({ ...allowed, safe: decision.safe, action: decision.action })) })
      const result = await run_consumer_workflow(request, { dependency })
      expect(result.status).toBe(decision.status)
      expect(result.explanation).toBeNull()
      expect(dependency.conductor).not.toHaveBeenCalled()
      expect(dependency.dispatcher).not.toHaveBeenCalled()
    })
  }

  for (const invalid of [{ safe: true }, { ...allowed, confidence: 2 }, null]) {
    it('fails closed for malformed Bodyguard output', async () => {
      const dependency = dependencies({ bodyguard: mock(async () => invalid) })
      const result = await run_consumer_workflow(request, { dependency })
      expect(result.status).toBe('error')
      expect(dependency.conductor).not.toHaveBeenCalled()
      expect(dependency.dispatcher).not.toHaveBeenCalled()
    })
  }

  it('does not expose provider errors or continue after Bodyguard failure', async () => {
    const dependency = dependencies({
      bodyguard: mock(async () => {
        throw new Error('private-provider-detail')
      }),
    })
    const result = await run_consumer_workflow(request, { dependency })
    expect(result.status).toBe('error')
    expect(JSON.stringify(result)).not.toContain('private-provider-detail')
    expect(dependency.conductor).not.toHaveBeenCalled()
    expect(dependency.dispatcher).not.toHaveBeenCalled()
  })

  it('rejects an invalid Conductor plan', async () => {
    const dependency = dependencies({ conductor: mock(async () => ({ intent: 'Check', steps: [{ agent: 'Unknown', purpose: 'Invalid role' }] })) })
    const result = await run_consumer_workflow(request, { dependency })
    expect(result.status).toBe('error')
    expect(result.explanation).toBeNull()
    expect(dependency.dispatcher).not.toHaveBeenCalled()
  })

  it('connects the default Detective adapter to product-brand lookup and preserves unresolved gates', async () => {
    const bodyguard = spyOn($agent_bodyguard, 'generateText').mockResolvedValue({ output: allowed } as Awaited<
      ReturnType<typeof $agent_bodyguard.generateText>
    >)
    const conductor = spyOn($agent_conductor, 'generateText').mockResolvedValue({
      output: { intent: 'Product analysis', steps: [{ agent: 'Dispatcher', purpose: 'Plan checks' }] },
    } as Awaited<ReturnType<typeof $agent_conductor.generateText>>)
    const dispatcher = spyOn($agent_dispatcher, 'generateText').mockImplementation(async (message) => {
      const input = JSON.parse(message as string) as type_schema_agent_dispatcher_input
      return { output: dispatcher_plan_fixture(input) } as Awaited<ReturnType<typeof $agent_dispatcher.generateText>>
    })
    const lookup = spyOn($agent_detective, 'generateText')
    const local = spyOn(service_boycott_decision, 'decide').mockResolvedValue({
      data: {
        decision_status: 'unknown',
        confidence: 0,
        reason: 'No local match.',
        matched_entity: null,
        matched_path: [],
        sources: [],
        alternatives: [],
      },
    })
    const provider_data = {
      provider: 'boycat' as const,
      provider_status: 'not_found' as const,
      decision_status: 'unknown' as const,
      confidence: 0,
      reason: 'No Boycat match.',
      matched_entity: null,
      campaigns: [],
      sources: [],
      alternatives: [],
    }
    const provider = spyOn(service_boycott_provider, 'decide').mockResolvedValue({ data: provider_data })
    const bait_tester = spyOn($agent_bait_tester, 'generateText').mockResolvedValue({
      output: { safe: true, action: 'allow', risks: [], reason: 'Provider data is safe to consume.', confidence: 1 },
    } as Awaited<ReturnType<typeof $agent_bait_tester.generateText>>)
    try {
      const cases = [
        {
          toolResults: [
            {
              toolName: 'tool_product_lookup_local_by_barcode',
              output: { found: true, source: 'local_database', data: [{ product_name: 'Cola', product_brand_name: 'Cola Brand' }] },
            },
          ],
          status: 'completed',
          product_name: 'Cola',
        },
        {
          toolResults: [
            { toolName: 'tool_product_lookup_brand_by_name', output: { found: true, source: 'local_database', data: [{ brand_name: 'Example' }] } },
          ],
          status: 'completed',
          product_name: null,
        },
        {
          toolResults: [{ toolName: 'tool_product_lookup_local_by_barcode', output: { found: false, source: 'local_database', data: [] } }],
          status: 'needs_input',
          product_name: null,
        },
        { toolResults: [], status: 'needs_input', product_name: null },
        {
          toolResults: [
            {
              toolName: 'tool_product_lookup_local_by_name',
              output: { found: true, source: 'local_database', data: [{ product_name: 'Cola A' }, { product_name: 'Cola B' }] },
            },
          ],
          status: 'needs_input',
          product_name: null,
        },
      ] as const
      for (const { toolResults, status, product_name } of cases) {
        lookup.mockResolvedValue({ toolResults, text: 'Unreviewed lookup details' } as unknown as Awaited<
          ReturnType<typeof $agent_detective.generateText>
        >)
        const result = await run_consumer_workflow(request)
        expect(result.status).toBe(status)
        expect(result.product?.name ?? null).toBe(product_name)
        expect(result.assessments.map((assessment) => assessment.agent)).toEqual(['Detective', 'Investigator'])
        expect(result.limitations.join(' ')).not.toContain('Detective is not implemented')
        expect(result.limitations.join(' ')).not.toContain('Gatekeeper is not implemented')
        expect(JSON.stringify(result)).not.toContain('Unreviewed lookup details')
      }
      expect(bodyguard).toHaveBeenCalledTimes(cases.length)
      expect(conductor).toHaveBeenCalledTimes(cases.length)
      expect(dispatcher).toHaveBeenCalledTimes(cases.length)
      expect(lookup).toHaveBeenCalledTimes(cases.length)
      expect(lookup.mock.calls[0]![0]).toBe(request.prompt)
      expect(lookup.mock.calls[0]![1]?.abortSignal).toBeInstanceOf(AbortSignal)
      expect(lookup.mock.calls[0]![1]?.tools).toHaveLength(1)
      const input = JSON.parse(dispatcher.mock.calls[0]![0] as string)
      expect(input.prompt).toBe(request.prompt)
      expect(input.bodyguard).toEqual(allowed)
      expect(input.conductor_plan.intent).toBe('Product analysis')
      expect(input).not.toHaveProperty('user_id')
      expect(dispatcher.mock.calls[0]![1]?.abortSignal).toBeInstanceOf(AbortSignal)
    } finally {
      bodyguard.mockRestore()
      conductor.mockRestore()
      dispatcher.mockRestore()
      lookup.mockRestore()
      local.mockRestore()
      provider.mockRestore()
      bait_tester.mockRestore()
    }
  })

  it('passes Detective resolved identities to the connected Investigator and skips unresolved identities', async () => {
    const bodyguard = spyOn($agent_bodyguard, 'generateText').mockResolvedValue({ output: allowed } as Awaited<
      ReturnType<typeof $agent_bodyguard.generateText>
    >)
    const conductor = spyOn($agent_conductor, 'generateText').mockResolvedValue({
      output: { intent: 'Investigate product ethics', steps: [{ agent: 'Dispatcher', purpose: 'Plan ethics checks' }] },
    } as Awaited<ReturnType<typeof $agent_conductor.generateText>>)
    const dispatcher = spyOn($agent_dispatcher, 'generateText').mockImplementation(async (message) => {
      const input = JSON.parse(message as string) as type_schema_agent_dispatcher_input
      return {
        output: {
          selected_agents: [
            { agent: 'Detective', depends_on: [], run_when: 'always' },
            { agent: 'Investigator', depends_on: ['Detective'], run_when: 'always' },
            { agent: 'Skeptic', depends_on: ['Detective', 'Investigator'], run_when: 'always' },
            { agent: 'Referee', depends_on: ['Skeptic'], run_when: 'always' },
            { agent: 'Storyteller', depends_on: ['Skeptic', 'Referee'], run_when: 'always' },
            { agent: 'Gatekeeper', depends_on: ['Storyteller'], run_when: 'always' },
          ],
          required_checks: ['identity', 'ethics', 'evidence', 'hard_constraints', 'final_response'],
          budgets: { ...input.budget_limits, max_alternative_candidates: 0, max_candidate_review_passes: 0 },
          untrusted_content_policy: 'bait_tester_before_consumption',
          candidate_validation: 'not_requested',
        },
      } as Awaited<ReturnType<typeof $agent_dispatcher.generateText>>
    })
    const lookup = spyOn($agent_detective, 'generateText')
    const local = spyOn(service_boycott_decision, 'decide').mockResolvedValue({
      data: {
        decision_status: 'unknown',
        confidence: 0,
        reason: 'No local match.',
        matched_entity: null,
        matched_path: [],
        sources: [],
        alternatives: [],
      },
    })
    const provider_data = {
      provider: 'boycat' as const,
      provider_status: 'not_found' as const,
      decision_status: 'unknown' as const,
      confidence: 0,
      reason: 'No Boycat match.',
      matched_entity: null,
      campaigns: [],
      sources: [],
      alternatives: [],
    }
    const provider = spyOn(service_boycott_provider, 'decide').mockResolvedValue({ data: provider_data })
    const bait_tester = spyOn($agent_bait_tester, 'generateText').mockResolvedValue({
      output: { safe: true, action: 'allow', risks: [], reason: 'Provider data is safe to consume.', confidence: 1 },
    } as Awaited<ReturnType<typeof $agent_bait_tester.generateText>>)

    try {
      lookup.mockResolvedValue({
        toolResults: [
          { toolName: 'tool_product_lookup_brand_by_name', output: { found: true, source: 'local_database', data: [{ brand_name: 'Coca-Cola' }] } },
        ],
      } as unknown as Awaited<ReturnType<typeof $agent_detective.generateText>>)
      const brand_result = await run_consumer_workflow({ ...request, prompt: 'Investigate Coca-Cola' })
      expect(brand_result.status).toBe('completed')
      expect(brand_result.assessments.map((assessment) => assessment.agent)).toEqual(['Detective', 'Investigator'])
      expect(brand_result.limitations.join(' ')).not.toContain('Investigator is not implemented')
      expect(local).toHaveBeenNthCalledWith(1, { product_brand_name: 'Coca-Cola', candidate_names: [] })
      expect(provider).toHaveBeenNthCalledWith(1, { provider: 'boycat', brand_name: 'Coca-Cola' }, expect.any(AbortSignal))

      lookup.mockResolvedValue({
        toolResults: [
          {
            toolName: 'tool_product_lookup_local_by_barcode',
            output: {
              found: true,
              source: 'local_database',
              data: [
                {
                  product_name: 'Coca-Cola Original Taste',
                  product_brand_name: 'COCA-COLA SERVICES SA/NV, Coca-Cola',
                  product_brand_names: ['COCA-COLA SERVICES SA/NV', 'Coca-Cola'],
                  product_barcode: '5449000054227',
                },
              ],
            },
          },
        ],
      } as unknown as Awaited<ReturnType<typeof $agent_detective.generateText>>)
      const product_result = await run_consumer_workflow({ ...request, prompt: 'Investigate barcode 5449000054227' })
      expect(product_result.status).toBe('completed')
      expect(product_result.product).toEqual({
        barcode: '5449000054227',
        name: 'Coca-Cola Original Taste',
        brand: 'Coca-Cola',
      })
      expect(local).toHaveBeenNthCalledWith(2, {
        product_brand_name: 'Coca-Cola',
        candidate_names: ['COCA-COLA SERVICES SA/NV'],
      })
      expect(provider).toHaveBeenNthCalledWith(2, { provider: 'boycat', brand_name: 'Coca-Cola' }, expect.any(AbortSignal))
      expect(provider).toHaveBeenNthCalledWith(3, { provider: 'boycat', brand_name: 'COCA-COLA SERVICES SA/NV' }, expect.any(AbortSignal))
      expect(bait_tester).toHaveBeenCalledTimes(3)
      expect(bait_tester.mock.calls[0]?.[0]).toBe(JSON.stringify(provider_data))

      lookup.mockResolvedValue({
        toolResults: [
          {
            toolName: 'tool_product_lookup_local_by_name',
            output: { found: true, source: 'local_database', data: [{ product_name: 'Cola A' }, { product_name: 'Cola B' }] },
          },
        ],
      } as unknown as Awaited<ReturnType<typeof $agent_detective.generateText>>)
      const unresolved = await run_consumer_workflow({ ...request, prompt: 'Investigate cola' })
      expect(unresolved.status).toBe('needs_input')
      expect(local).toHaveBeenCalledTimes(2)
      expect(provider).toHaveBeenCalledTimes(3)
    } finally {
      bodyguard.mockRestore()
      conductor.mockRestore()
      dispatcher.mockRestore()
      lookup.mockRestore()
      local.mockRestore()
      provider.mockRestore()
      bait_tester.mockRestore()
    }
  })

  it('fails closed when Dispatcher returns a malformed plan', async () => {
    const dependency = dependencies({ dispatcher: mock(async () => ({ selected_agents: [] })) })
    const result = await run_consumer_workflow(request, { dependency })
    expect(result.status).toBe('error')
    expect(result.product).toBeNull()
    expect(result.assessments).toEqual([])
    expect(result.explanation).toBeNull()
  })

  it('identifies Dispatcher provider failures without exposing provider details', async () => {
    const provider_error = Object.assign(new Error('private-dispatcher-response'), { statusCode: 404 })
    const dependency = dependencies({
      dispatcher: mock(async () => {
        throw new Error('Dispatcher planning failed', { cause: provider_error })
      }),
    })
    const log = spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await run_consumer_workflow(request, { dependency })
      expect(result.status).toBe('error')
      expect(result.limitations[0]).toContain('AI_DISPATCHER_MODEL')
      expect(log).toHaveBeenCalledWith('[ai.workflow.failed]', {
        execution_id: result.execution_id,
        step: 'dispatcher-plan',
        code: 'provider_model_unavailable',
        provider_status: 404,
      })
      expect(JSON.stringify({ result, logs: log.mock.calls })).not.toContain('private-dispatcher-response')
    } finally {
      log.mockRestore()
    }
  })

  for (const timeout_ms of [1000, 90_000]) {
    it(`gives Dispatcher only the remaining capped deadline from a ${timeout_ms} ms workflow`, async () => {
      const now = spyOn(performance, 'now').mockReturnValue(1000)
      const dependency = dependencies({
        conductor: mock(async () => {
          now.mockReturnValue(1300)
          return { intent: 'Product analysis', steps: [{ agent: 'Dispatcher', purpose: 'Plan checks' }] }
        }),
        dispatcher: mock(async (input) => {
          expect(input.budget_limits.timeout_ms).toBe(Math.min(timeout_ms - 300, dispatcher_budget_limit.timeout_ms))
          return dispatcher_plan_fixture(input)
        }),
      })
      try {
        const result = await run_consumer_workflow(request, { dependency, timeout_ms })
        expect(result.status).toBe('partial')
        expect(dependency.dispatcher).toHaveBeenCalledTimes(1)
      } finally {
        now.mockRestore()
      }
    })
  }

  it('does not start Dispatcher when previous work has exhausted the deadline', async () => {
    const now = spyOn(performance, 'now').mockReturnValue(1000)
    const dependency = dependencies({
      conductor: mock(async () => {
        now.mockReturnValue(2001)
        return { intent: 'Product analysis', steps: [{ agent: 'Dispatcher', purpose: 'Plan checks' }] }
      }),
    })
    try {
      const result = await run_consumer_workflow(request, { dependency, timeout_ms: 1000 })
      expect(result.status).toBe('error')
      expect(result.limitations[0]).toContain('time limit')
      expect(dependency.dispatcher).not.toHaveBeenCalled()
    } finally {
      now.mockRestore()
    }
  })

  it('propagates cancellation to Dispatcher and discards a late plan', async () => {
    const controller = new AbortController()
    const dependency = dependencies({
      dispatcher: mock(async (input, signal) => {
        controller.abort()
        expect(signal.aborted).toBe(true)
        return dispatcher_plan_fixture(input)
      }),
    })
    const result = await run_consumer_workflow(request, { dependency, signal: controller.signal })
    expect(result.status).toBe('error')
    expect(result.limitations[0]).toContain('cancelled')
    expect(result).not.toHaveProperty('dispatcher_plan')
  })

  for (const failure of [
    {
      status: 400,
      message: 'API key not valid. Please pass a valid API key.',
      code: 'provider_authentication_failed',
      text: 'GOOGLE_GENERATIVE_AI_API_KEY',
    },
    { status: 401, message: 'Unauthorized', code: 'provider_authentication_failed', text: 'server API key' },
    { status: 403, message: 'Forbidden', code: 'provider_access_denied', text: 'permissions' },
    { status: 429, message: 'Quota exceeded', code: 'provider_quota_exceeded', text: 'quota' },
    { status: 404, message: 'Model not found', code: 'provider_model_unavailable', text: 'AI_BODYGUARD_MODEL' },
  ]) {
    it(`reports provider failure ${failure.status} without exposing request or credential details`, async () => {
      const provider_error = Object.assign(new Error(failure.message), {
        statusCode: failure.status,
        requestBodyValues: { key: 'private-api-key', prompt: 'private-prompt' },
        responseBody: 'private-provider-response',
      })
      const dependency = dependencies({
        bodyguard: mock(async () => {
          throw new Error('Bodyguard assessment failed', { cause: provider_error })
        }),
      })
      const log = spyOn(console, 'error').mockImplementation(() => {})
      try {
        const result = await run_consumer_workflow(request, { dependency })
        expect(result.status).toBe('error')
        expect(result.limitations[0]).toContain(failure.text)
        expect(dependency.conductor).not.toHaveBeenCalled()
        expect(dependency.dispatcher).not.toHaveBeenCalled()
        expect(log).toHaveBeenCalledWith('[ai.workflow.failed]', {
          execution_id: result.execution_id,
          step: 'bodyguard',
          code: failure.code,
          provider_status: failure.status,
        })
        const output = JSON.stringify({ result, logs: log.mock.calls })
        for (const secret of ['private-api-key', 'private-prompt', 'private-provider-response']) expect(output).not.toContain(secret)
      } finally {
        log.mockRestore()
      }
    })
  }

  it('rejects invalid workflow input before agent execution', async () => {
    const dependency = dependencies()
    for (const invalid of [
      { ...request, prompt: '   ' },
      { ...request, user_id: 0 },
    ]) {
      await expect(run_consumer_workflow(invalid, { dependency })).rejects.toThrow()
    }
    expect(dependency.bodyguard).not.toHaveBeenCalled()
    expect(dependency.conductor).not.toHaveBeenCalled()
    expect(dependency.dispatcher).not.toHaveBeenCalled()
  })

  it('does not invoke agents for a cancelled request', async () => {
    const dependency = dependencies()
    const result = await run_consumer_workflow(request, { dependency, signal: AbortSignal.abort() })
    expect(result.status).toBe('error')
    expect(dependency.bodyguard).not.toHaveBeenCalled()
    expect(dependency.dispatcher).not.toHaveBeenCalled()
  })

  it('returns at the deadline even when Bodyguard ignores cancellation', async () => {
    const pending = Promise.withResolvers<unknown>()
    const dependency = dependencies({ bodyguard: mock(async () => pending.promise) })
    const result = await run_consumer_workflow(request, { dependency, timeout_ms: 30 })
    expect(result.status).toBe('error')
    expect(result.limitations[0]).toContain('time limit during bodyguard')
    expect(dependency.conductor).not.toHaveBeenCalled()
    pending.resolve(allowed)
    await Bun.sleep(10)
    expect(dependency.conductor).not.toHaveBeenCalled()
  })

  it('cancels a stalled Dispatcher on client disconnect without waiting for the deadline', async () => {
    const pending = Promise.withResolvers<unknown>()
    const controller = new AbortController()
    const started = Promise.withResolvers<void>()
    const dependency = dependencies({
      dispatcher: mock(async () => {
        started.resolve()
        return pending.promise
      }),
    })
    const running = run_consumer_workflow(request, { dependency, signal: controller.signal, timeout_ms: 2000 })
    await started.promise
    controller.abort()
    const result = await running
    expect(result.status).toBe('error')
    expect(result.limitations[0]).toContain('cancelled')
    pending.resolve({})
  })

  it('propagates a deadline and stops before planning', async () => {
    const dependency = dependencies({
      bodyguard: mock(async (_prompt, signal) => {
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve()
          else signal.addEventListener('abort', () => resolve(), { once: true })
        })
        signal.throwIfAborted()
        return allowed
      }),
    })
    const result = await run_consumer_workflow(request, { dependency, timeout_ms: 20 })
    expect(result.status).toBe('error')
    expect(dependency.conductor).not.toHaveBeenCalled()
    expect(dependency.dispatcher).not.toHaveBeenCalled()
  })

  it('keeps concurrent users and execution IDs separate', async () => {
    const dependency = dependencies()
    const results = await Promise.all([
      run_consumer_workflow({ prompt: 'First request', user_id: 1 }, { dependency }),
      run_consumer_workflow({ prompt: 'Second request', user_id: 2 }, { dependency }),
    ])
    expect(results[0]!.execution_id).not.toBe(results[1]!.execution_id)
    for (const result of results) expect(result).not.toHaveProperty('user_id')
    expect(dependency.conductor).toHaveBeenCalledWith('First request', expect.any(AbortSignal))
    expect(dependency.conductor).toHaveBeenCalledWith('Second request', expect.any(AbortSignal))
    expect(dependency.dispatcher).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'First request' }), expect.any(AbortSignal))
    expect(dependency.dispatcher).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Second request' }), expect.any(AbortSignal))
  })
})
