import type {
  type_ai_workflow_step,
  type_schema_agent_conductor_input,
  type_schema_agent_conductor_result,
} from '@agent/conductor/conductor.schema.agent'
import type { consumer_event_reporter, consumer_execution_data } from '@ai/execution/execution-contract.ai'
import type { consumer_dependency } from '@ai/workflow/workflow-dependency.ai'
import type { lib_dto_payload } from '@lib/dto.lib'

import { andThen, createWorkflowChain } from '@voltagent/core'

import { create_consumer_execution, merge_consumer_parallel } from '@ai/execution.ai'
import { ai_workflow_timeout_ms } from '@ai/runtime.ai'
import { default_dependency } from '@ai/workflow/workflow-dependency.ai'
import { create_workflow_event_reporter } from '@ai/workflow/workflow-event.ai'
import { describe_workflow_failure } from '@ai/workflow/workflow-failure.ai'
import { create_planning_stages } from '@ai/workflow/workflow-planning.ai'
import { schema_agent_conductor, schema_agent_conductor_input } from '@agent/conductor/conductor.schema.agent'

import { lib_error } from '@lib/error.lib'

export type { consumer_dependency } from '@ai/workflow/workflow-dependency.ai'

// The consumer analysis flow, in execution order. Stage logic lives in:
// - workflow-planning.ai.ts    Bodyguard, Conductor and Dispatcher stages
// - execution.ai.ts            specialist routing, gating, budgets and the final result
// - workflow-dependency.ai.ts  which adapter is connected to each agent slot
export const create_consumer_workflow = (
  dependency: consumer_dependency,
  signal: AbortSignal,
  deadline_ms: number,
  report_event: consumer_event_reporter = () => undefined,
  authenticated_payload?: lib_dto_payload,
) => {
  const planning = create_planning_stages({ dependency, signal, deadline_ms, report_event })
  const execution = create_consumer_execution(dependency, signal, deadline_ms, report_event, authenticated_payload)

  return (
    createWorkflowChain({
      id: 'consumer_product_analysis',
      name: 'Consumer product analysis',
      input: schema_agent_conductor_input,
      result: schema_agent_conductor,
    })
      // 1. Planning: entry policy, advisory plan, binding plan.
      .andThen({
        id: 'conductor-initialize',
        execute: async ({ data, state }) => {
          signal.throwIfAborted()
          return { ...data, execution_id: state.executionId }
        },
      })
      .andThen({ id: 'bodyguard', execute: async ({ data }) => planning.bodyguard(data) })
      .andThen({ id: 'conductor-plan', execute: async ({ data }) => planning.conductor(data) })
      .andThen({ id: 'dispatcher-plan', execute: async ({ data }) => planning.dispatcher(data) })

      // 2. Specialists. Null adapters record placeholders, never findings.
      .andThen({ id: 'specialists-initialize', execute: async ({ data }) => execution.initialize(data) })
      .andAll({
        id: 'product-and-personal-context',
        steps: [
          andThen({
            id: 'detective',
            execute: async ({ data }: { data: consumer_execution_data }) => execution.parallel('Detective', data),
          }),
          andThen({
            id: 'vault-keeper',
            execute: async ({ data }: { data: consumer_execution_data }) => execution.parallel('Vault Keeper', data),
          }),
        ],
      })
      .andThen({ id: 'merge-product-and-context', execute: async ({ data }) => merge_consumer_parallel(data) })
      .andAll({
        id: 'specialist-checks',
        steps: [
          andThen({
            id: 'medic',
            execute: async ({ data }: { data: consumer_execution_data }) => execution.parallel('Medic', data),
          }),
          andThen({
            id: 'investigator',
            execute: async ({ data }: { data: consumer_execution_data }) => execution.parallel('Investigator', data),
          }),
          andThen({
            id: 'eco-scout',
            execute: async ({ data }: { data: consumer_execution_data }) => execution.parallel('Eco Scout', data),
          }),
          andThen({
            id: 'historian',
            execute: async ({ data }: { data: consumer_execution_data }) => execution.parallel('Historian', data),
          }),
        ],
      })
      .andThen({ id: 'merge-specialist-checks', execute: async ({ data }) => merge_consumer_parallel(data) })

      // 3. Review, personalization and alternatives.
      .andThen({ id: 'skeptic', execute: async ({ data }) => execution.run('Skeptic', data) })
      .andThen({ id: 'referee', execute: async ({ data }) => execution.run('Referee', data) })
      .andThen({ id: 'coach', execute: async ({ data }) => execution.run('Coach', data) })
      .andThen({ id: 'bargain-hunter', execute: async ({ data }) => execution.run('Bargain Hunter', data) })
      .andThen({ id: 'candidate-review', execute: async ({ data }) => execution.review_candidates(data) })

      // 4. Response: explanation, final validation, bounded repair, public result.
      .andThen({ id: 'storyteller', execute: async ({ data }) => execution.run('Storyteller', data) })
      .andThen({ id: 'gatekeeper', execute: async ({ data }) => execution.run('Gatekeeper', data) })
      .andThen({ id: 'response-repair', execute: async ({ data }) => execution.repair_response(data) })
      .andThen({ id: 'conductor-result', execute: async ({ data }) => execution.result(data) })
  )
}

// Entry point used by the AI service: validates input, owns the deadline and always returns a validated result.
export const run_consumer_workflow = async (
  input: type_schema_agent_conductor_input,
  options: {
    signal?: AbortSignal
    dependency?: consumer_dependency
    timeout_ms?: number
    on_step?: (event: type_ai_workflow_step) => void
    /** Verified server context, never part of workflow data or model inputs. */
    authenticated_payload?: lib_dto_payload
  } = {},
): Promise<type_schema_agent_conductor_result> => {
  const data = schema_agent_conductor_input.parse(input)
  if (options.authenticated_payload && options.authenticated_payload.user_id !== data.user_id) throw lib_error.unauthorized
  const execution_id = crypto.randomUUID()
  const workflow_step_id = crypto.randomUUID()
  const workflow_started_at = performance.now()
  const { steps, report_event } = create_workflow_event_reporter(execution_id, options.on_step)
  report_event({
    step_id: workflow_step_id,
    type: 'workflow.started',
    agent: null,
    status: 'running',
    title: 'Analysis started',
    detail: 'Preparing the product and brand workflow.',
    metadata: { tool: null, duration_ms: null },
  })
  const timeout_ms = options.timeout_ms ?? ai_workflow_timeout_ms
  const deadline_ms = performance.now() + timeout_ms
  const timeout = AbortSignal.timeout(timeout_ms)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  const workflow = create_consumer_workflow(
    options.dependency ?? default_dependency,
    signal,
    deadline_ms,
    report_event,
    options.authenticated_payload,
  )
  const execution = await workflow.run(data, { executionId: execution_id, userId: String(data.user_id) })

  if (execution.status === 'completed' && execution.result) {
    const result = schema_agent_conductor.parse(execution.result)
    report_event({
      step_id: workflow_step_id,
      type: 'workflow.completed',
      agent: null,
      status: result.status,
      title: 'Analysis finished',
      detail: result.subject ? `Finished analyzing ${result.subject.name}.` : 'The workflow finished without resolving a subject.',
      metadata: { tool: null, duration_ms: Math.round(performance.now() - workflow_started_at) },
    })
    return schema_agent_conductor.parse({ ...result, steps })
  }

  const failure = describe_workflow_failure(execution.error, signal)
  console.error('[ai.workflow.failed]', {
    execution_id,
    step: failure.step,
    code: failure.code,
    provider_status: failure.provider_status,
  })

  report_event({
    step_id: workflow_step_id,
    type: 'workflow.failed',
    agent: null,
    status: 'error',
    title: 'Analysis failed',
    detail: failure.limitation,
    metadata: { tool: null, duration_ms: Math.round(performance.now() - workflow_started_at) },
  })

  return {
    execution_id,
    status: 'error',
    subject: null,
    outcome: null,
    product: null,
    assessments: [],
    alternatives: [],
    explanation: null,
    sources: [],
    limitations: [failure.limitation],
    steps,
  }
}
