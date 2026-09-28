import { Agent } from '@voltagent/core'
import { Output } from 'ai'

import { trusted_agent_generation_options } from '@ai/generation.ai'
import { ai_groq, ai_groq_default_model } from '@ai/provider.ai'
import { prompt_agent_bodyguard } from '@agent/bodyguard/bodyguard.prompt.agent'
import { SecurityDecision } from '@agent/bodyguard/bodyguard.schema.agent'

export const bodyguard_generation_retry_limit = 2

export const $agent_bodyguard = new Agent({
  name: 'Bodyguard',
  purpose: 'Analyze requests for security risks',
  instructions: prompt_agent_bodyguard,
  model: ai_groq(process.env.GROQ_BODYGUARD_MODEL || ai_groq_default_model),
  memory: false,
})

export const agent_bodyguard = async (message: string, signal?: AbortSignal) => {
  try {
    const result = await $agent_bodyguard.generateText(message, {
      ...trusted_agent_generation_options,
      output: Output.object({ schema: SecurityDecision }),
      temperature: 0,
      maxRetries: bodyguard_generation_retry_limit,
      abortSignal: signal,
    })
    return { success: true as const, data: SecurityDecision.parse(result.output) }
  } catch (error) {
    return { success: false as const, data: error }
  }
}
