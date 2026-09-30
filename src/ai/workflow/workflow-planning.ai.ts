import type { type_schema_agent_bodyguard } from '@agent/bodyguard/bodyguard.schema.agent'
import type { type_schema_agent_conductor_plan } from '@agent/conductor/conductor.schema.agent'
import type { consumer_event_reporter } from '@ai/execution/execution-contract.ai'
import type { consumer_dependency } from '@ai/workflow/workflow-dependency.ai'

import { run_reported_agent } from '@ai/workflow/workflow-event.ai'
import { SecurityDecision } from '@agent/bodyguard/bodyguard.schema.agent'
import { schema_agent_conductor_plan } from '@agent/conductor/conductor.schema.agent'
import { dispatcher_budget_limit } from '@agent/dispatcher/constants'
import { normalize_dispatcher_plan, schema_agent_dispatcher, schema_agent_dispatcher_draft } from '@agent/dispatcher/dispatcher.schema.agent'

type planning_context = {
  dependency: Pick<consumer_dependency, 'bodyguard' | 'conductor' | 'dispatcher'>
  signal: AbortSignal
  deadline_ms: number
  report_event: consumer_event_reporter
}

type request_data = { prompt: string; execution_id: string }

const is_allowed = (decision: type_schema_agent_bodyguard) => decision.safe && decision.action === 'allow'

// The three planning stages that run before any specialist: entry policy, advisory plan, binding plan.
export const create_planning_stages = ({ dependency, signal, deadline_ms, report_event }: planning_context) => ({
  // Entry policy. A request that is not allowed skips every later model call.
  bodyguard: async <T extends request_data>(data: T) => {
    signal.throwIfAborted()
    const bodyguard = await run_reported_agent({
      execution_id: data.execution_id,
      workflow_step: 'bodyguard',
      agent: 'Bodyguard',
      title: 'Checking request safety',
      detail: 'Applying the entry policy before product lookup.',
      signal,
      report_event,
      execute: async () => SecurityDecision.parse(await dependency.bodyguard(data.prompt, signal)),
      completed: (result) => ({
        title: is_allowed(result) ? 'Request approved' : 'Request stopped by policy',
        detail: result.reason,
        status: is_allowed(result) ? 'completed' : result.action === 'human_review' ? 'needs_review' : 'blocked',
      }),
    })
    signal.throwIfAborted()
    return { ...data, bodyguard }
  },

  // Advisory intent and proposed steps for Dispatcher.
  conductor: async <T extends request_data & { bodyguard: type_schema_agent_bodyguard }>(data: T) => {
    signal.throwIfAborted()
    if (!is_allowed(data.bodyguard)) return { ...data, plan: null }
    const plan = await run_reported_agent({
      execution_id: data.execution_id,
      workflow_step: 'conductor-plan',
      agent: 'Conductor',
      title: 'Understanding the request',
      detail: 'Extracting the requested product analysis intent.',
      signal,
      report_event,
      execute: async () => schema_agent_conductor_plan.parse(await dependency.conductor(data.prompt, signal)),
      completed: (result) => ({ title: 'Request understood', detail: result.intent }),
    })
    signal.throwIfAborted()
    return { ...data, plan }
  },

  // Binding plan: selected agents, dependencies, checks and budgets within the remaining deadline.
  dispatcher: async <T extends request_data & { bodyguard: type_schema_agent_bodyguard; plan: type_schema_agent_conductor_plan | null }>(data: T) => {
    signal.throwIfAborted()
    const conductor_plan = data.plan
    if (!is_allowed(data.bodyguard) || !conductor_plan) return { ...data, dispatcher_plan: null }
    const remaining_ms = Math.floor(deadline_ms - performance.now())
    if (remaining_ms <= 0) throw new DOMException('Workflow deadline exceeded', 'TimeoutError')
    const dispatcher_plan = await run_reported_agent({
      execution_id: data.execution_id,
      workflow_step: 'dispatcher-plan',
      agent: 'Dispatcher',
      title: 'Planning agent work',
      detail: 'Selecting the required implemented agents and execution budget.',
      signal,
      report_event,
      execute: async () =>
        schema_agent_dispatcher.parse(
          normalize_dispatcher_plan(
            schema_agent_dispatcher_draft.parse(
              await dependency.dispatcher(
                {
                  prompt: data.prompt,
                  bodyguard: data.bodyguard,
                  conductor_plan,
                  budget_limits: { ...dispatcher_budget_limit, timeout_ms: Math.min(remaining_ms, dispatcher_budget_limit.timeout_ms) },
                },
                signal,
              ),
            ),
          ),
        ),
      completed: (result) => ({
        title: 'Workflow plan ready',
        detail:
          `Selected ${result.selected_agents.map((step) => step.agent).join(', ')}.` +
          (result.investigation ? ` Investigation ${result.investigation.needed ? 'needed' : 'not needed'}: ${result.investigation.reason}` : ''),
      }),
    })
    signal.throwIfAborted()
    return { ...data, dispatcher_plan }
  },
})
