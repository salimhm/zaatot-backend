import type { type_schema_agent_dispatcher_input } from '@agent/dispatcher/dispatcher.schema.agent'

import { Agent } from '@voltagent/core'
import { Output } from 'ai'

import { ai_groq } from '@ai/provider.ai'
import { prompt_agent_dispatcher } from '@agent/dispatcher/dispatcher.prompt.agent'
import { schema_agent_dispatcher, schema_agent_dispatcher_input } from '@agent/dispatcher/dispatcher.schema.agent'

export const $agent_dispatcher = new Agent({
  name: 'Dispatcher',
  purpose: 'Select required agents, dependencies and bounded execution budgets',
  instructions: prompt_agent_dispatcher,
  model: ai_groq(process.env.AI_DISPATCHER_MODEL || 'openai/gpt-oss-20b'),
  memory: false,
})

export const agent_dispatcher = async (input: type_schema_agent_dispatcher_input, signal?: AbortSignal) => {
  try {
    const data = schema_agent_dispatcher_input.parse(input)
    signal?.throwIfAborted()
    const started_at = performance.now()
    const deadline = AbortSignal.timeout(data.budget_limits.timeout_ms)
    const abort_signal = signal ? AbortSignal.any([signal, deadline]) : deadline
    const result = await $agent_dispatcher.generateText(JSON.stringify(data), {
      output: Output.object({ schema: schema_agent_dispatcher }),
      temperature: 0,
      maxRetries: 0,
      abortSignal: abort_signal,
    })
    abort_signal.throwIfAborted()
    const plan = schema_agent_dispatcher.parse(result.output)
    for (const key of Object.keys(data.budget_limits) as (keyof typeof data.budget_limits)[]) {
      if (plan.budgets[key] > data.budget_limits[key]) throw new Error(`Dispatcher exceeded the remaining ${key} budget`)
    }
    const remaining_ms = data.budget_limits.timeout_ms - Math.ceil(performance.now() - started_at)
    if (remaining_ms <= 0) throw new Error('Dispatcher exhausted the workflow deadline')
    plan.budgets.timeout_ms = Math.min(plan.budgets.timeout_ms, remaining_ms)
    return { success: true as const, data: plan }
  } catch (error) {
    return { success: false as const, data: error }
  }
}
