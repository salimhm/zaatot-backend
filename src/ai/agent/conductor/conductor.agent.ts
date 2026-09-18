import { Agent } from '@voltagent/core'
import { Output } from 'ai'

import { ai_google } from '@ai/provider.ai'
import { prompt_agent_conductor } from '@agent/conductor/conductor.prompt.agent'
import { schema_agent_conductor_plan } from '@agent/conductor/conductor.schema.agent'

export const $agent_conductor = new Agent({
  name: 'Conductor',
  purpose: 'Interpret the request and plan the consumer workflow',
  instructions: prompt_agent_conductor,
  model: ai_google(process.env.AI_CONDUCTOR_MODEL || 'gemini-3.5-flash-lite'),
  memory: false
})

export const agent_conductor = async (message: string, signal?: AbortSignal) => {
  try {
    const result = await $agent_conductor.generateText(message, {
      output: Output.object({ schema: schema_agent_conductor_plan }),
      temperature: 0,
      maxRetries: 0,
      abortSignal: signal,
    })
    return { success: true as const, data: schema_agent_conductor_plan.parse(result.output) }
  } catch (error) {
    return { success: false as const, data: error }
  }
}
