import type { type_schema_agent_conductor_result } from '@agent/conductor/conductor.schema.agent'
import type {
  consumer_backend_context,
  consumer_event_reporter,
  consumer_execution_data,
  consumer_execution_dependency,
  consumer_parallel_result,
  consumer_specialist,
  consumer_specialist_input,
  consumer_specialist_name,
  consumer_step_result,
} from '@ai/execution/execution-contract.ai'
import type { lib_dto_payload } from '@lib/dto.lib'

import { schema_step_result } from '@ai/execution/execution-contract.ai'
import { agent_completion, agent_title, event_status } from '@ai/execution/execution-event.ai'
import { build_consumer_result } from '@ai/execution/execution-result.ai'
import { create_execution_runtime } from '@ai/execution/execution-runtime.ai'
import { run_workflow_step } from '@ai/runtime.ai'

// Specialist routing for one request. Supporting code lives in src/ai/execution/:
// - execution-contract.ai.ts     adapter contract and workflow data types
// - execution-runtime.ai.ts      shared deadline, tool budget and Bait Tester inspection
// - execution-event.ai.ts        activity-feed titles for specialist steps
// - execution-result.ai.ts       final public result
// - execution-explanation.ai.ts  temporary explanation until Storyteller/Gatekeeper exist

const skipped = (reason: string): consumer_step_result => ({ status: 'skipped', output: null, limitations: [reason] })
const placeholder = (name: string): consumer_step_result => ({
  status: 'not_implemented',
  output: null,
  limitations: [`${name} is not implemented. Its required work has not been executed.`],
})

// Snapshot only the verified identity/access fields, separately from workflow data.
const snapshot_backend_context = (payload?: lib_dto_payload): consumer_backend_context | undefined =>
  payload
    ? {
        payload: {
          user_id: payload.user_id,
          ...(payload.tenants
            ? {
                tenants: payload.tenants.map(({ tenant_id, tenant_type, tenant_schema_version }) => ({
                  tenant_id,
                  tenant_type,
                  tenant_schema_version,
                })),
              }
            : {}),
        },
      }
    : undefined

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
export const create_consumer_execution = (
  dependency: consumer_execution_dependency,
  parent_signal: AbortSignal,
  deadline_ms: number,
  report_event: consumer_event_reporter = () => undefined,
  authenticated_payload?: lib_dto_payload,
) => {
  const backend_context = snapshot_backend_context(authenticated_payload)
  const runtime = create_execution_runtime({ parent_signal, deadline_ms, report_event, bait_tester: dependency.bait_tester })
  const exhausted_budget = (): consumer_step_result => ({
    status: 'needs_review',
    output: null,
    limitations: ['The shared tool-call budget is exhausted.'],
  })

  const initialize = (data: Omit<consumer_execution_data, 'agent_results' | 'candidate_review'>): consumer_execution_data => {
    runtime.start(data.execution_id, data.dispatcher_plan?.budgets ?? null)
    return { ...data, agent_results: {}, candidate_review: null }
  }

  // Calls one adapter with bounded retries, validates its envelope and reports its step events.
  const invoke = async (
    step: string,
    handler: consumer_specialist,
    input: consumer_specialist_input,
    agent?: consumer_specialist_name,
  ): Promise<consumer_step_result> => {
    const step_id = crypto.randomUUID()
    const started_at = performance.now()
    if (agent) {
      report_event({
        step_id,
        type: 'agent.started',
        agent,
        status: 'running',
        title: agent_title(agent),
        detail: agent === 'Detective' ? `Resolving “${input.prompt}”.` : null,
        metadata: { tool: null, duration_ms: null },
      })
    }

    try {
      for (let attempt = 0; ; attempt++) {
        runtime.check_deadline()
        let result: consumer_step_result
        if (runtime.budget_exhausted) {
          result = exhausted_budget()
        } else {
          try {
            result = await run_workflow_step(input.execution_id, step, runtime.signal, async () =>
              schema_step_result.parse(
                await (agent === 'Vault Keeper' && backend_context
                  ? handler(input, runtime.signal, backend_context)
                  : handler(input, runtime.signal)),
              ),
            )
            runtime.check_deadline()
            if (runtime.budget_exhausted) result = exhausted_budget()
          } catch (error) {
            if (runtime.signal.aborted) throw error
            runtime.check_deadline()
            if (!runtime.budget_exhausted && attempt < (runtime.budgets?.max_retries ?? 0)) continue
            result = runtime.budget_exhausted
              ? exhausted_budget()
              : { status: 'needs_review', output: null, limitations: ['The agent could not produce a validated result.'] }
          }
        }

        if (agent) {
          const completion = agent_completion(agent, result)
          report_event({
            step_id,
            type: 'agent.completed',
            agent,
            status: event_status(result.status),
            title: completion.title,
            detail: completion.detail,
            metadata: { tool: null, duration_ms: Math.round(performance.now() - started_at) },
          })
        }
        return result
      }
    } catch (error) {
      if (agent) {
        report_event({
          step_id,
          type: 'agent.failed',
          agent,
          status: 'error',
          title: `${agent} failed`,
          detail: 'The agent could not complete its assigned work.',
          metadata: { tool: null, duration_ms: Math.round(performance.now() - started_at) },
        })
      }
      throw error
    }
  }

  // Passes prerequisite envelopes and shared runtime helpers, never the whole workflow object.
  const input_for = (
    data: consumer_execution_data,
    required: consumer_specialist_name[],
    agent: consumer_specialist_name | null = null,
  ): consumer_specialist_input => ({
    prompt: data.prompt,
    execution_id: data.execution_id,
    dependencies: Object.fromEntries(required.map((name) => [name, data.agent_results[name]])),
    candidate_review: data.candidate_review,
    budgets: runtime.remaining_budgets(),
    use_tool: (call, activity) => runtime.use_tool(call, activity, agent),
    inspect_content: (text) => runtime.inspect_content(text, agent),
  })

  // Selection, permission and prerequisite gates, then the adapter call.
  const execute = async (agent: consumer_specialist_name, data: consumer_execution_data, feedback?: consumer_step_result) => {
    runtime.check_deadline()
    const step = data.dispatcher_plan?.selected_agents.find((selected) => selected.agent === agent)
    if (!step) return undefined
    const handler = dependency.specialists?.[agent]
    // The workflow definition includes future slots, but only connected adapters
    // participate in the current execution.
    if (!handler) return undefined

    const permissions = data.agent_results['Vault Keeper']?.permissions
    const report_skipped = (reason: string) => {
      report_event({
        step_id: crypto.randomUUID(),
        type: 'agent.skipped',
        agent,
        status: 'skipped',
        title: `${agent} skipped`,
        detail: reason,
        metadata: { tool: null, duration_ms: 0 },
      })
      return skipped(reason)
    }
    if (step.run_when === 'personalization_permitted' && permissions?.personalization !== true) {
      return report_skipped('Vault Keeper has not permitted personalization.')
    }
    if (step.run_when === 'history_permitted' && permissions?.history !== true) return report_skipped('Vault Keeper has not permitted history use.')
    const unavailable = step.depends_on.filter((name) => data.agent_results[name]?.status !== 'completed')
    if (unavailable.length) return report_skipped(`Required inputs are unavailable: ${unavailable.join(', ')}.`)
    if (
      agent === 'Storyteller' &&
      data.dispatcher_plan?.candidate_validation === 'repeat_required_checks' &&
      data.candidate_review?.status !== 'completed'
    ) {
      return report_skipped('Alternative candidates have not passed the required review.')
    }

    const input = input_for(data, step.depends_on, agent)
    if (agent === 'Medic') input.medic_checks = step.medic_checks ?? []
    if (agent === 'Vault Keeper') input.user_id = data.user_id
    if (feedback) input.feedback = feedback
    const result = await invoke(agent.toLowerCase().replaceAll(' ', '-'), handler, input, agent)
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
    runtime.check_deadline()
    if (data.dispatcher_plan?.candidate_validation !== 'repeat_required_checks') return data
    if (!dependency.specialists?.['Bargain Hunter']) return data
    if (data.agent_results['Bargain Hunter']?.status !== 'completed') {
      return { ...data, candidate_review: skipped('Alternative candidate retrieval has not completed.') }
    }
    // TODO: the adapter must cap candidates and repeat identity, applicable specialists,
    // Skeptic, Referee and permitted Coach checks using the same use_tool / deadline.
    const candidate_review = dependency.candidate_review
      ? await invoke(
          'candidate-review',
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
      runtime.check_deadline()
      if (attempt >= (runtime.budgets?.max_response_repairs ?? 0)) {
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
    runtime.check_deadline()
    return build_consumer_result(data, dependency)
  }

  return { initialize, parallel, run, review_candidates, repair_response, result }
}
