import type { type_schema_agent_conductor_input, type_schema_agent_conductor_result } from '@agent/conductor/conductor.schema.agent'

import { createWorkflowChain } from '@voltagent/core'

import { agent_bodyguard } from '@agent/bodyguard/bodyguard.agent'
import { SecurityDecision } from '@agent/bodyguard/bodyguard.schema.agent'
import { agent_conductor } from '@agent/conductor/conductor.agent'
import { schema_agent_conductor, schema_agent_conductor_input, schema_agent_conductor_plan } from '@agent/conductor/conductor.schema.agent'

export type consumer_dependency = {
  bodyguard: (prompt: string, signal: AbortSignal) => Promise<unknown>
  conductor: (prompt: string, signal: AbortSignal) => Promise<unknown>
}

const default_dependency: consumer_dependency = {
  bodyguard: async (prompt, signal) => {
    const result = await agent_bodyguard(prompt, signal)
    if (!result.success) throw new Error('Bodyguard assessment failed')
    return result.data
  },
  conductor: async (prompt, signal) => {
    const result = await agent_conductor(prompt, signal)
    if (!result.success) throw new Error('Conductor planning failed')
    return result.data
  },
}

export const create_consumer_workflow = (dependency: consumer_dependency, signal: AbortSignal) =>
  createWorkflowChain({
    id: 'consumer_product_analysis',
    name: 'Consumer workflow startup',
    input: schema_agent_conductor_input,
    result: schema_agent_conductor,
  })
    .andThen({
      id: 'conductor-initialize',
      execute: async ({ data, state }) => {
        signal.throwIfAborted()
        return { ...data, execution_id: state.executionId }
      },
    })
    .andThen({
      id: 'bodyguard',
      execute: async ({ data }) => {
        signal.throwIfAborted()
        const bodyguard = SecurityDecision.parse(await dependency.bodyguard(data.prompt, signal))
        signal.throwIfAborted()
        return { ...data, bodyguard }
      },
    })
    .andThen({
      id: 'conductor-plan',
      execute: async ({ data }) => {
        signal.throwIfAborted()
        if (!data.bodyguard.safe || data.bodyguard.action !== 'allow') {
          return { ...data, plan: null }
        }
        const plan = schema_agent_conductor_plan.parse(await dependency.conductor(data.prompt, signal))
        signal.throwIfAborted()
        return { ...data, plan }
      },
    })
    .andThen({
      id: 'conductor-result',
      execute: async ({ data }): Promise<type_schema_agent_conductor_result> => {
        signal.throwIfAborted()
        const allowed = data.bodyguard.safe && data.bodyguard.action === 'allow'
        return {
          execution_id: data.execution_id,
          status: allowed ? 'partial' : data.bodyguard.action === 'human_review' ? 'needs_review' : 'blocked',
          product: null,
          assessments: [],
          alternatives: [],
          explanation: null,
          sources: [],
          limitations: allowed
            ? ['Only workflow startup, Bodyguard and Conductor planning are implemented. Proposed steps have not been executed.']
            : ['The request did not pass the entry policy. No further agents were executed.'],
        }
      },
    })

export const run_consumer_workflow = async (
  input: type_schema_agent_conductor_input,
  options: { signal?: AbortSignal; dependency?: consumer_dependency; timeout_ms?: number } = {},
): Promise<type_schema_agent_conductor_result> => {
  const data = schema_agent_conductor_input.parse(input)
  const execution_id = crypto.randomUUID()
  const timeout = AbortSignal.timeout(options.timeout_ms ?? 45_000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  const workflow = create_consumer_workflow(options.dependency ?? default_dependency, signal)
  const execution = await workflow.run(data, { executionId: execution_id, userId: String(data.user_id) })

  if (execution.status === 'completed' && execution.result) {
    return schema_agent_conductor.parse(execution.result)
  }

  return {
    execution_id,
    status: 'error',
    product: null,
    assessments: [],
    alternatives: [],
    explanation: null,
    sources: [],
    limitations: ['Workflow startup could not complete. No analysis result is available.'],
  }
}
