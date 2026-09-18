import { describe, expect, it, mock } from 'bun:test'
import type { type_schema_agent_dispatcher, type_schema_agent_dispatcher_input } from '@agent/dispatcher/dispatcher.schema.agent'
import type { consumer_specialist, consumer_specialist_name, consumer_step_result } from '@ai/execution.ai'
import type { consumer_dependency } from '@ai/workflow.ai'

import { run_consumer_workflow } from '@ai/workflow.ai'
import { schema_agent_dispatcher } from '@agent/dispatcher/dispatcher.schema.agent'

const request = { prompt: 'Check this cereal and suggest an alternative', user_id: 7 }
const core: consumer_specialist_name[] = ['Detective', 'Skeptic', 'Referee', 'Storyteller', 'Gatekeeper']
const dependencies: Record<consumer_specialist_name, consumer_specialist_name[]> = {
  Detective: [],
  'Vault Keeper': [],
  Medic: ['Detective', 'Vault Keeper'],
  Investigator: ['Detective'],
  'Eco Scout': ['Detective'],
  Historian: ['Vault Keeper'],
  Skeptic: ['Detective', 'Medic', 'Investigator', 'Eco Scout', 'Historian'],
  Referee: ['Skeptic'],
  Coach: ['Vault Keeper', 'Referee'],
  'Bargain Hunter': ['Detective', 'Referee', 'Coach'],
  Storyteller: ['Skeptic', 'Referee', 'Coach', 'Bargain Hunter'],
  Gatekeeper: ['Storyteller'],
}
const checks: Partial<Record<consumer_specialist_name, type_schema_agent_dispatcher['required_checks'][number]>> = {
  Detective: 'identity',
  'Vault Keeper': 'personal_context',
  Medic: 'clinical_risk',
  Investigator: 'ethics',
  'Eco Scout': 'environment',
  Historian: 'history',
  Skeptic: 'evidence',
  Referee: 'hard_constraints',
  Coach: 'goal_fit',
  'Bargain Hunter': 'alternatives',
  Gatekeeper: 'final_response',
}
const all = Object.keys(dependencies) as consumer_specialist_name[]
const complete = (output: unknown = {}): consumer_step_result => ({ status: 'completed', output, limitations: [] })

function fixture(selected = all) {
  const calls: string[] = []
  const handlers = Object.fromEntries(
    all.map((agent) => [
      agent,
      mock<consumer_specialist>(async (input) => {
        calls.push(agent)
        if (agent === 'Vault Keeper')
          return { ...complete({ permitted_context: 'private-context' }), permissions: { personalization: true, history: true } }
        if (agent === 'Gatekeeper')
          return complete({
            execution_id: input.execution_id,
            status: 'completed',
            product: { barcode: null, name: 'Reviewed cereal', brand: null },
            assessments: [],
            alternatives: [],
            explanation: null,
            sources: [],
            limitations: [],
          })
        return complete({ agent })
      }),
    ]),
  ) as Record<consumer_specialist_name, ReturnType<typeof mock<consumer_specialist>>>
  const candidate_review = mock<consumer_specialist>(async () => {
    calls.push('Candidate review')
    return complete({ candidates: [] })
  })
  const plan = (input: type_schema_agent_dispatcher_input): type_schema_agent_dispatcher =>
    schema_agent_dispatcher.parse({
      selected_agents: selected.map((agent) => ({
        agent,
        depends_on: dependencies[agent].filter((name) => selected.includes(name)),
        run_when: agent === 'Coach' ? 'personalization_permitted' : agent === 'Historian' ? 'history_permitted' : 'always',
      })),
      required_checks: selected.flatMap((agent) => (checks[agent] ? [checks[agent]] : [])),
      budgets: {
        ...input.budget_limits,
        max_retries: 0,
        max_alternative_candidates: selected.includes('Bargain Hunter') ? 2 : 0,
        max_candidate_review_passes: selected.includes('Bargain Hunter') ? 1 : 0,
      },
      untrusted_content_policy: 'bait_tester_before_consumption',
      candidate_validation: selected.includes('Bargain Hunter') ? 'repeat_required_checks' : 'not_requested',
    })
  const dependency: consumer_dependency = {
    bodyguard: mock(async () => ({ safe: true, action: 'allow', riskLevel: 'none', risks: [], reason: 'Allowed', confidence: 1 })),
    conductor: mock(async () => ({ intent: 'Product analysis', steps: [] })),
    dispatcher: mock(async (input) => plan(input)),
    specialists: handlers,
    candidate_review,
  }
  return { dependency, handlers, candidate_review, calls, plan }
}

describe('Consumer specialist workflow slots', () => {
  it('keeps missing agents as placeholders without fabricating analysis or final approval', async () => {
    const { dependency } = fixture()
    dependency.specialists = {}
    const result = await run_consumer_workflow(request, { dependency })
    expect(result.status).toBe('partial')
    expect(result.product).toBeNull()
    expect(result.assessments).toEqual([])
    expect(result.explanation).toBeNull()
    for (const name of all) expect(result.limitations.join(' ')).toContain(`${name} is not implemented`)
    expect(result).not.toHaveProperty('agent_results')
  })

  it('runs both parallel groups, merges every result, and preserves sequential gates', async () => {
    const { dependency, handlers, calls, candidate_review } = fixture()
    const first = Promise.withResolvers<void>()
    const second = Promise.withResolvers<void>()
    let first_started = 0
    let second_started = 0
    for (const name of ['Detective', 'Vault Keeper'] as const) {
      const implementation = handlers[name].getMockImplementation()!
      handlers[name].mockImplementation(async (input, signal) => {
        if (++first_started === 2) first.resolve()
        await Promise.race([first.promise, new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))])
        return implementation(input, signal)
      })
    }
    for (const name of ['Medic', 'Investigator', 'Eco Scout', 'Historian'] as const) {
      const implementation = handlers[name].getMockImplementation()!
      handlers[name].mockImplementation(async (input, signal) => {
        expect(first_started).toBe(2)
        if (++second_started === 4) second.resolve()
        await Promise.race([
          second.promise,
          new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
        ])
        return implementation(input, signal)
      })
    }
    const result = await run_consumer_workflow(request, { dependency, timeout_ms: 2000 })
    expect(result.status).toBe('completed')
    expect(result.product?.name).toBe('Reviewed cereal')
    expect(second_started).toBe(4)
    expect(calls.slice(6)).toEqual(['Skeptic', 'Referee', 'Coach', 'Bargain Hunter', 'Candidate review', 'Storyteller', 'Gatekeeper'])
    expect(Object.keys(handlers.Skeptic.mock.calls[0]![0].dependencies).sort()).toEqual(
      ['Detective', 'Medic', 'Investigator', 'Eco Scout', 'Historian'].sort(),
    )
    expect(handlers.Medic.mock.calls[0]![0].dependencies['Vault Keeper']?.status).toBe('completed')
    expect(handlers['Vault Keeper'].mock.calls[0]![0].user_id).toBe(7)
    expect(handlers.Investigator.mock.calls[0]![0]).not.toHaveProperty('user_id')
    expect(handlers.Investigator.mock.calls[0]![0].dependencies).not.toHaveProperty('Vault Keeper')
    expect(handlers.Storyteller.mock.calls[0]![0].candidate_review?.status).toBe('completed')
    expect(candidate_review).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(result)).not.toContain('private-context')
  })

  it('runs only selected agents and no candidate review for a general request', async () => {
    const { dependency, handlers, candidate_review, calls } = fixture(core)
    const result = await run_consumer_workflow(request, { dependency })
    expect(result.status).toBe('completed')
    expect(calls).toEqual(core)
    expect(handlers.Investigator).not.toHaveBeenCalled()
    expect(handlers['Vault Keeper']).not.toHaveBeenCalled()
    expect(candidate_review).not.toHaveBeenCalled()
  })

  it('skips every downstream slot after Bodyguard rejects a request', async () => {
    const { dependency, handlers, candidate_review } = fixture()
    dependency.bodyguard = mock(async () => ({ safe: false, action: 'block', riskLevel: 'high', risks: [], reason: 'Blocked', confidence: 1 }))
    const result = await run_consumer_workflow(request, { dependency })
    expect(result.status).toBe('blocked')
    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled()
    expect(candidate_review).not.toHaveBeenCalled()
  })

  it('leaves personal checks unresolved when Vault Keeper denies permission', async () => {
    const { dependency, handlers } = fixture()
    handlers['Vault Keeper'].mockResolvedValue({ ...complete({}), permissions: { personalization: false, history: false } })
    const result = await run_consumer_workflow(request, { dependency })
    expect(result.status).toBe('needs_review')
    expect(handlers.Historian).not.toHaveBeenCalled()
    expect(handlers.Coach).not.toHaveBeenCalled()
    expect(handlers.Gatekeeper).not.toHaveBeenCalled()
    expect(result.explanation).toBeNull()
  })

  it('stops dependent analysis for an ambiguous product and preserves Referee blocks', async () => {
    for (const [agent, status] of [
      ['Detective', 'needs_input'],
      ['Referee', 'blocked'],
    ] as const) {
      const { dependency, handlers } = fixture()
      handlers[agent].mockResolvedValue({ status, output: null, limitations: ['Unresolved or restricted.'] })
      const result = await run_consumer_workflow(request, { dependency })
      expect(result.status).toBe(status)
      expect(handlers.Coach).not.toHaveBeenCalled()
      expect(handlers.Gatekeeper).not.toHaveBeenCalled()
      if (agent === 'Detective') expect(handlers.Medic).not.toHaveBeenCalled()
    }
  })

  it('withholds alternatives until the candidate review adapter is connected', async () => {
    const { dependency, handlers } = fixture()
    dependency.candidate_review = null
    const result = await run_consumer_workflow(request, { dependency })
    expect(result.status).toBe('needs_review')
    expect(result.alternatives).toEqual([])
    expect(handlers.Storyteller).not.toHaveBeenCalled()
    expect(handlers.Gatekeeper).not.toHaveBeenCalled()
  })

  it('shares one tool budget between parallel agents', async () => {
    const { dependency, handlers, plan } = fixture()
    const tool = mock(async () => 'tool output')
    dependency.dispatcher = mock(async (input) => ({ ...plan(input), budgets: { ...plan(input).budgets, max_tool_calls: 1 } }))
    for (const name of ['Detective', 'Vault Keeper'] as const) {
      handlers[name].mockImplementation(async (input) => complete(await input.use_tool(tool)))
    }
    const result = await run_consumer_workflow(request, { dependency })
    expect(result.status).toBe('needs_review')
    expect(tool).toHaveBeenCalledTimes(1)
    expect(result.limitations.join(' ')).toContain('tool-call budget')
  })

  it('uses Bait Tester on demand and fails closed while its slot is empty', async () => {
    const { dependency, handlers } = fixture(core)
    handlers.Detective.mockImplementation(async (input) => complete(await input.inspect_content('untrusted text')))
    expect((await run_consumer_workflow(request, { dependency })).status).toBe('needs_review')
    const inspect = mock(async (_text: string, _signal: AbortSignal) => ({ usable: true, text: 'inspected facts' }))
    dependency.bait_tester = inspect
    expect((await run_consumer_workflow(request, { dependency })).status).toBe('completed')
    expect(inspect).toHaveBeenCalledWith('untrusted text', expect.any(AbortSignal))
    expect(inspect.mock.calls[0]?.length).toBe(2)
  })

  it('passes Gatekeeper feedback to Storyteller and caps repair attempts', async () => {
    for (const repaired of [true, false]) {
      const { dependency, handlers } = fixture(core)
      const approved = handlers.Gatekeeper.getMockImplementation()!
      handlers.Gatekeeper.mockImplementation(async (input, signal) =>
        repaired && handlers.Gatekeeper.mock.calls.length > 1
          ? approved(input, signal)
          : { status: 'repair_required', output: null, limitations: ['Repair the draft.'] },
      )
      const result = await run_consumer_workflow(request, { dependency })
      expect(result.status).toBe(repaired ? 'completed' : 'error')
      expect(handlers.Gatekeeper).toHaveBeenCalledTimes(2)
      expect(handlers.Storyteller).toHaveBeenCalledTimes(2)
      expect(handlers.Storyteller.mock.calls[1]![0].feedback?.status).toBe('repair_required')
    }
  })

  it('propagates the Dispatcher deadline to a running specialist', async () => {
    const { dependency, handlers, plan } = fixture(core)
    dependency.dispatcher = mock(async (input) => ({ ...plan(input), budgets: { ...plan(input).budgets, timeout_ms: 50 } }))
    handlers.Detective.mockImplementation(async (_input, signal) => {
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve()
        else signal.addEventListener('abort', () => resolve(), { once: true })
      })
      signal.throwIfAborted()
      return complete()
    })
    const result = await run_consumer_workflow(request, { dependency, timeout_ms: 2000 })
    expect(result.status).toBe('error')
    expect(result.limitations[0]).toContain('time limit')
    expect(handlers.Skeptic).not.toHaveBeenCalled()
  })
})
