import type { type_schema_agent_dispatcher_input } from '@agent/dispatcher/dispatcher.schema.agent'

import { agent_bodyguard } from '@agent/bodyguard/bodyguard.agent'
import { agent_conductor } from '@agent/conductor/conductor.agent'
import { agent_dispatcher } from '@agent/dispatcher/dispatcher.agent'

// Planning agents return { success, data }. The workflow needs the data or a thrown error
// whose message identifies the failed step (see describe_workflow_failure).

export const adapter_bodyguard = async (prompt: string, signal: AbortSignal) => {
  const result = await agent_bodyguard(prompt, signal)
  if (!result.success) throw new Error('Bodyguard assessment failed', { cause: result.data })
  return result.data
}

export const adapter_conductor = async (prompt: string, signal: AbortSignal) => {
  const result = await agent_conductor(prompt, signal)
  if (!result.success) throw new Error('Conductor planning failed', { cause: result.data })
  return result.data
}

export const adapter_dispatcher = async (input: type_schema_agent_dispatcher_input, signal: AbortSignal) => {
  const result = await agent_dispatcher(input, signal)
  if (!result.success) throw new Error('Dispatcher planning failed', { cause: result.data })
  return result.data
}
