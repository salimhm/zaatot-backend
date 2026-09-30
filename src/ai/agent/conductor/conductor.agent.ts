import type { type_schema_agent_conductor_plan } from '@agent/conductor/conductor.schema.agent'

import { Agent } from '@voltagent/core'
import { Output } from 'ai'

import { trusted_agent_generation_options } from '@ai/generation.ai'
import { ai_groq, ai_groq_default_model } from '@ai/provider.ai'
import { prompt_agent_conductor } from '@agent/conductor/conductor.prompt.agent'
import { schema_agent_conductor_plan } from '@agent/conductor/conductor.schema.agent'

export const $agent_conductor = new Agent({
  name: 'Conductor',
  purpose: 'Interpret the request and plan the consumer workflow',
  instructions: prompt_agent_conductor,
  model: ai_groq(process.env.GROQ_CONDUCTOR_MODEL || ai_groq_default_model),
  memory: false,
})

// Roles that run before planning are never part of the proposed plan.
const conductor_excluded_steps = new Set<string>(['Bodyguard', 'Conductor'])

/** Removes pre-planning roles and repeated roles instead of failing the request on a harmless model slip. */
export const normalize_conductor_plan = (plan: type_schema_agent_conductor_plan): type_schema_agent_conductor_plan => {
  const seen = new Set<string>()
  return {
    intent: plan.intent,
    steps: plan.steps.filter((step) => {
      if (conductor_excluded_steps.has(step.agent) || seen.has(step.agent)) return false
      seen.add(step.agent)
      return true
    }),
  }
}

export const agent_conductor = async (message: string, signal?: AbortSignal) => {
  try {
    signal?.throwIfAborted()
    const result = await $agent_conductor.generateText(message, {
      ...trusted_agent_generation_options,
      output: Output.object({ schema: schema_agent_conductor_plan }),
      temperature: 0,
      maxRetries: 0,
      abortSignal: signal,
    })
    signal?.throwIfAborted()
    return { success: true as const, data: normalize_conductor_plan(schema_agent_conductor_plan.parse(result.output)) }
  } catch (error) {
    return { success: false as const, data: error }
  }
}
