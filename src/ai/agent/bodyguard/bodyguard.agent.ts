import { Agent } from '@voltagent/core'
import { Output } from 'ai'

import { ai_groq } from '@ai/provider.ai'
import { prompt_agent_bodyguard } from '@agent/bodyguard/bodyguard.prompt.agent'
import { SecurityDecision } from '@agent/bodyguard/bodyguard.schema.agent'

export const $agent_bodyguard = new Agent({
  name: 'Bodyguard',
  purpose: 'Analyze requests for security risks',
  instructions: prompt_agent_bodyguard,
  model: ai_groq(process.env.AI_BODYGUARD_MODEL || 'openai/gpt-oss-20b'),
  memory: false,
})

export const agent_bodyguard = async (message: string, signal?: AbortSignal) => {
  try {
    const result = await $agent_bodyguard.generateText(message, {
      output: Output.object({ schema: SecurityDecision }),
      temperature: 0,
      maxRetries: 0,
      abortSignal: signal,
    })
    return { success: true as const, data: SecurityDecision.parse(result.output) }
  } catch (error) {
    return { success: false as const, data: error }
  }
}
