import type { type_schema_agent_bodyguard } from '@agent/bodyguard/bodyguard.schema.agent'
import type {
  type_schema_agent_conductor_input,
  type_schema_agent_conductor_plan,
  type_schema_agent_conductor_result,
} from '@agent/conductor/conductor.schema.agent'
import type { type_schema_agent_dispatcher } from '@agent/dispatcher/dispatcher.schema.agent'

import { z } from 'zod'

import { schema_agent_conductor_result } from '@agent/conductor/conductor.schema.agent'

export type consumer_specialist_name = type_schema_agent_dispatcher['selected_agents'][number]['agent']

// Adapters validate their own agent output before returning this workflow envelope.
const schema_step_result = z.object({
  status: z.enum(['completed', 'partial', 'blocked', 'needs_input', 'needs_review', 'error', 'repair_required', 'skipped', 'not_implemented']),
  output: z.unknown(),
  limitations: z.array(z.string()),
  permissions: z.object({ personalization: z.boolean(), history: z.boolean() }).optional(),
})

export type consumer_step_result = z.infer<typeof schema_step_result>

export type consumer_specialist_input = {
  prompt: string
  execution_id: string
  /** Supplied only to Vault Keeper; retrieve permitted fields through services. */
  user_id?: number
  dependencies: Partial<Record<consumer_specialist_name, consumer_step_result>>
  candidate_review: consumer_step_result | null
  feedback?: consumer_step_result
  budgets: type_schema_agent_dispatcher['budgets']
  /** Adapters must wrap each real tool call to charge the shared budget. */
  use_tool: <T>(call: () => Promise<T>) => Promise<T>
  /** Inspect external free text before passing it to an agent. No private context is supplied. */
  inspect_content: (text: string) => Promise<string>
}

export type consumer_specialist = (input: consumer_specialist_input, signal: AbortSignal) => Promise<consumer_step_result>

export type consumer_execution_dependency = {
  specialists?: Partial<Record<consumer_specialist_name, consumer_specialist | null>>
  /** Rerun applicable checks on bounded alternative candidates before Storyteller. */
  candidate_review?: consumer_specialist | null
  bait_tester?: ((text: string, signal: AbortSignal) => Promise<{ usable: boolean; text: string }>) | null
}

export type consumer_execution_data = type_schema_agent_conductor_input & {
  execution_id: string
  bodyguard: type_schema_agent_bodyguard
  plan: type_schema_agent_conductor_plan | null
  dispatcher_plan: type_schema_agent_dispatcher | null
  agent_results: Partial<Record<consumer_specialist_name, consumer_step_result>>
  candidate_review: consumer_step_result | null
}

export type consumer_parallel_result = {
  data: consumer_execution_data
  updates: consumer_execution_data['agent_results']
}

const skipped = (reason: string): consumer_step_result => ({ status: 'skipped', output: null, limitations: [reason] })
const placeholder = (name: string): consumer_step_result => ({
  status: 'not_implemented',
  output: null,
  limitations: [`${name} is not implemented. Its required work has not been executed.`],
})

// andAll returns an array. Merge only each branch's own additions, preserving the common input.
export const merge_consumer_parallel = (branches: consumer_parallel_result[]): consumer_execution_data => {
  const first = branches[0]
  if (!first) throw new Error('A parallel workflow stage must contain at least one branch')
  return {
    ...first.data,
    agent_results: Object.assign({}, first.data.agent_results, ...branches.map((branch) => branch.updates)),
  }
}

// One executor per request, sharing its deadline and counters across parallel branches and repairs.
export const create_consumer_execution = (dependency: consumer_execution_dependency, parent_signal: AbortSignal, deadline_ms: number) => {
  let signal = parent_signal
  let execution_deadline = deadline_ms
  let tool_calls = 0
  let budget_exhausted = false
  let budgets: type_schema_agent_dispatcher['budgets'] | null = null

  const check_deadline = () => {
    signal.throwIfAborted()
    if (performance.now() >= execution_deadline) throw new DOMException('Workflow deadline exceeded', 'TimeoutError')
  }

  const use_tool = async <T>(call: () => Promise<T>): Promise<T> => {
    check_deadline()
    if (!budgets || tool_calls >= budgets.max_tool_calls) {
      budget_exhausted = true
      throw new Error('The shared workflow tool-call budget is exhausted')
    }
    tool_calls++
    const result = await call()
    check_deadline()
    return result
  }

  const inspect_content = async (text: string) => {
    check_deadline()
    if (!dependency.bait_tester) throw new Error('Bait Tester is not implemented; external text cannot be consumed')
    const result = await dependency.bait_tester(text, signal)
    check_deadline()
    if (result.usable !== true || typeof result.text !== 'string') throw new Error('Bait Tester did not approve this external text')
    return result.text
  }

  const initialize = (data: Omit<consumer_execution_data, 'agent_results' | 'candidate_review'>): consumer_execution_data => {
    check_deadline()
    budgets = data.dispatcher_plan ? { ...data.dispatcher_plan.budgets } : null
    if (budgets) {
      execution_deadline = Math.min(deadline_ms, performance.now() + budgets.timeout_ms)
      const remaining_ms = Math.floor(execution_deadline - performance.now())
      if (remaining_ms <= 0) throw new DOMException('Workflow deadline exceeded', 'TimeoutError')
      signal = AbortSignal.any([parent_signal, AbortSignal.timeout(remaining_ms)])
    }
    return { ...data, agent_results: {}, candidate_review: null }
  }

  const invoke = async (handler: consumer_specialist, input: consumer_specialist_input): Promise<consumer_step_result> => {
    for (let attempt = 0; ; attempt++) {
      check_deadline()
      if (budget_exhausted) return { status: 'needs_review', output: null, limitations: ['The shared tool-call budget is exhausted.'] }
      try {
        const result = schema_step_result.parse(await handler(input, signal))
        check_deadline()
        if (budget_exhausted) return { status: 'needs_review', output: null, limitations: ['The shared tool-call budget is exhausted.'] }
        return result
      } catch {
        check_deadline()
        if (budget_exhausted || attempt >= (budgets?.max_retries ?? 0)) {
          return {
            status: 'needs_review',
            output: null,
            limitations: [budget_exhausted ? 'The shared tool-call budget is exhausted.' : 'The agent could not produce a validated result.'],
          }
        }
      }
    }
  }

  const input_for = (data: consumer_execution_data, required: consumer_specialist_name[]): consumer_specialist_input => {
    if (!budgets) throw new Error('Specialist execution requires a Dispatcher plan')
    return {
      prompt: data.prompt,
      execution_id: data.execution_id,
      dependencies: Object.fromEntries(required.map((name) => [name, data.agent_results[name]])),
      candidate_review: data.candidate_review,
      budgets: {
        ...budgets,
        timeout_ms: Math.max(0, Math.floor(execution_deadline - performance.now())),
        max_tool_calls: Math.max(0, budgets.max_tool_calls - tool_calls),
      },
      use_tool,
      inspect_content,
    }
  }

  const execute = async (agent: consumer_specialist_name, data: consumer_execution_data, feedback?: consumer_step_result) => {
    check_deadline()
    const step = data.dispatcher_plan?.selected_agents.find((selected) => selected.agent === agent)
    if (!step) return undefined
    const handler = dependency.specialists?.[agent]
    if (!handler) return placeholder(agent)

    const permissions = data.agent_results['Vault Keeper']?.permissions
    if (step.run_when === 'personalization_permitted' && permissions?.personalization !== true) {
      return skipped('Vault Keeper has not permitted personalization.')
    }
    if (step.run_when === 'history_permitted' && permissions?.history !== true) return skipped('Vault Keeper has not permitted history use.')
    const unavailable = step.depends_on.filter((name) => data.agent_results[name]?.status !== 'completed')
    if (unavailable.length) return skipped(`Required inputs are unavailable: ${unavailable.join(', ')}.`)
    if (
      agent === 'Storyteller' &&
      data.dispatcher_plan?.candidate_validation === 'repeat_required_checks' &&
      data.candidate_review?.status !== 'completed'
    ) {
      return skipped('Alternative candidates have not passed the required review.')
    }

    const input = input_for(data, step.depends_on)
    if (agent === 'Vault Keeper') input.user_id = data.user_id
    if (feedback) input.feedback = feedback
    const result = await invoke(handler, input)
    // Only Vault Keeper can grant permissions; agent-local data stays internal until final review.
    if (agent !== 'Vault Keeper') delete result.permissions
    return result
  }

  const parallel = async (agent: consumer_specialist_name, data: consumer_execution_data): Promise<consumer_parallel_result> => {
    const result = await execute(agent, data)
    return { data, updates: result ? { [agent]: result } : {} }
  }

  const run = async (
    agent: consumer_specialist_name,
    data: consumer_execution_data,
    feedback?: consumer_step_result,
  ): Promise<consumer_execution_data> => {
    const result = await execute(agent, data, feedback)
    return result ? { ...data, agent_results: { ...data.agent_results, [agent]: result } } : data
  }

  const review_candidates = async (data: consumer_execution_data): Promise<consumer_execution_data> => {
    check_deadline()
    if (data.dispatcher_plan?.candidate_validation !== 'repeat_required_checks') return data
    if (data.agent_results['Bargain Hunter']?.status !== 'completed') {
      return { ...data, candidate_review: skipped('Alternative candidate retrieval has not completed.') }
    }
    // TODO: the adapter must cap candidates and repeat identity, applicable specialists,
    // Skeptic, Referee and permitted Coach checks using the same use_tool / deadline.
    const candidate_review = dependency.candidate_review
      ? await invoke(
          dependency.candidate_review,
          input_for(
            data,
            data.dispatcher_plan.selected_agents.filter((step) => data.agent_results[step.agent]?.status === 'completed').map((step) => step.agent),
          ),
        )
      : placeholder('Alternative candidate review')
    return { ...data, candidate_review }
  }

  const repair_response = async (data: consumer_execution_data): Promise<consumer_execution_data> => {
    let repaired = data
    for (let attempt = 0; repaired.agent_results.Gatekeeper?.status === 'repair_required'; attempt++) {
      check_deadline()
      if (attempt >= (budgets?.max_response_repairs ?? 0)) {
        return {
          ...repaired,
          agent_results: {
            ...repaired.agent_results,
            Gatekeeper: { status: 'error', output: null, limitations: ['The final response repair budget is exhausted.'] },
          },
        }
      }
      repaired = await run('Storyteller', repaired, repaired.agent_results.Gatekeeper)
      if (repaired.agent_results.Storyteller?.status !== 'completed') return repaired
      repaired = await run('Gatekeeper', repaired)
    }
    return repaired
  }

  const result = (data: consumer_execution_data): type_schema_agent_conductor_result => {
    check_deadline()
    const allowed = data.bodyguard.safe && data.bodyguard.action === 'allow'
    const steps = Object.values(data.agent_results)
    const incomplete = data.dispatcher_plan?.selected_agents.filter((step) => data.agent_results[step.agent]?.status !== 'completed') ?? []
    const candidate_pending = data.dispatcher_plan?.candidate_validation === 'repeat_required_checks' && data.candidate_review?.status !== 'completed'
    const gatekeeper = data.agent_results.Gatekeeper
    if (allowed && incomplete.length === 0 && !candidate_pending && gatekeeper?.status === 'completed') {
      // The Gatekeeper adapter must return the complete validated API response as output.
      const approved = schema_agent_conductor_result.parse(gatekeeper.output)
      return { ...approved, execution_id: data.execution_id }
    }
    const placeholders_only = steps.every((step) => step.status === 'not_implemented' || step.status === 'skipped')
    let status: type_schema_agent_conductor_result['status'] = 'needs_review'
    if (!allowed) status = data.bodyguard.action === 'human_review' ? 'needs_review' : 'blocked'
    else if (steps.some((step) => step.status === 'blocked')) status = 'blocked'
    else if (steps.some((step) => step.status === 'error')) status = 'error'
    else if (steps.some((step) => step.status === 'needs_input')) status = 'needs_input'
    else if (placeholders_only) status = 'partial'
    return {
      execution_id: data.execution_id,
      status,
      product: null,
      assessments: [],
      alternatives: [],
      explanation: null,
      sources: [],
      limitations: !allowed
        ? ['The request did not pass the entry policy. No further agents were executed.']
        : [
            ...(placeholders_only
              ? ['Bodyguard, Conductor planning and Dispatcher planning ran. Selected specialist checks have not been executed.']
              : []),
            ...new Set(steps.flatMap((step) => step.limitations)),
            ...(data.candidate_review?.limitations ?? []),
            ...(incomplete.length ? [`Unresolved required agents: ${incomplete.map((step) => step.agent).join(', ')}.`] : []),
          ],
    }
  }

  return { initialize, parallel, run, review_candidates, repair_response, result }
}
