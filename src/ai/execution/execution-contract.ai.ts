import type { type_schema_agent_bodyguard } from '@agent/bodyguard/bodyguard.schema.agent'
import type {
  type_ai_workflow_step,
  type_schema_agent_conductor_input,
  type_schema_agent_conductor_plan,
} from '@agent/conductor/conductor.schema.agent'
import type { type_dispatcher_medic_check, type_schema_agent_dispatcher } from '@agent/dispatcher/dispatcher.schema.agent'
import type { ai_tool_activity } from '@ai/runtime.ai'
import type { lib_dto_payload } from '@lib/dto.lib'

import { z } from 'zod'

// The contract between the workflow and every specialist adapter.

export type consumer_specialist_name = type_schema_agent_dispatcher['selected_agents'][number]['agent']
export type consumer_event_reporter = (event: Omit<type_ai_workflow_step, 'sequence' | 'execution_id' | 'timestamp'>) => void

// Adapters validate their own agent output before returning this workflow envelope.
export const schema_step_result = z.object({
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
  /** Explicit Medic work selected by Dispatcher. Omitted for every other specialist. */
  medic_checks?: type_dispatcher_medic_check[]
  budgets: type_schema_agent_dispatcher['budgets']
  /** Adapters must wrap each real tool call to charge the shared budget. */
  use_tool: <T>(call: () => Promise<T>, activity?: ai_tool_activity) => Promise<T>
  /** Inspect external free text before passing it to an agent. No private context is supplied. */
  inspect_content: (text: string) => Promise<string>
}

/** Server-only context for Vault Keeper's adapter and its future tools. Never serialize into agent input/output. */
export type consumer_backend_context = {
  payload: lib_dto_payload
}

export type consumer_specialist = (
  input: consumer_specialist_input,
  signal: AbortSignal,
  backend_context?: consumer_backend_context,
) => Promise<consumer_step_result>

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
