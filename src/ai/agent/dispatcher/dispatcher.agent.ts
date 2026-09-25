import type { type_schema_agent_dispatcher_input } from '@agent/dispatcher/dispatcher.schema.agent'

import { Agent } from '@voltagent/core'
import { Output } from 'ai'

import { trusted_agent_generation_options } from '@ai/generation.ai'
import { ai_google, ai_google_default_model } from '@ai/provider.ai'
import { prompt_agent_dispatcher } from '@agent/dispatcher/dispatcher.prompt.agent'
import {
  normalize_dispatcher_plan,
  schema_agent_dispatcher,
  schema_agent_dispatcher_draft,
  schema_agent_dispatcher_input,
} from '@agent/dispatcher/dispatcher.schema.agent'

export const $agent_dispatcher = new Agent({
  name: 'Dispatcher',
  purpose: 'Select required agents, dependencies and bounded execution budgets',
  instructions: prompt_agent_dispatcher,
  model: ai_google(process.env.AI_DISPATCHER_MODEL || ai_google_default_model),
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
      ...trusted_agent_generation_options,
      output: Output.object({ schema: schema_agent_dispatcher_draft }),
      temperature: 0,
      maxRetries: 0,
      abortSignal: abort_signal,
    })
    abort_signal.throwIfAborted()
    const draft = schema_agent_dispatcher_draft.parse(result.output)
    for (const key of Object.keys(data.budget_limits) as (keyof typeof data.budget_limits)[]) {
      if (draft.budgets[key] > data.budget_limits[key]) throw new Error(`Dispatcher exceeded the remaining ${key} budget`)
    }
    const alternatives_selected = draft.selected_agents.some((step) => step.agent === 'Bargain Hunter')
    // Unused alternative limits are not allocations. Never spend them without Bargain Hunter.
    const plan = schema_agent_dispatcher.parse(
      normalize_dispatcher_plan({
        ...draft,
        budgets: {
          ...draft.budgets,
          max_alternative_candidates: alternatives_selected ? draft.budgets.max_alternative_candidates : 0,
          max_candidate_review_passes: alternatives_selected ? draft.budgets.max_candidate_review_passes : 0,
        },
      }),
    )
    const remaining_ms = data.budget_limits.timeout_ms - Math.ceil(performance.now() - started_at)
    if (remaining_ms <= 0) throw new Error('Dispatcher exhausted the workflow deadline')
    plan.budgets.timeout_ms = Math.min(plan.budgets.timeout_ms, remaining_ms)
    return { success: true as const, data: plan }
  } catch (error) {
    return { success: false as const, data: error }
  }
}
