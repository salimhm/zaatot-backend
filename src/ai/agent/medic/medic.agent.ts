import { Agent } from '@voltagent/core'
import { Output } from 'ai'

import { ai_groq } from '@ai/provider.ai'
import { prompt_agent_medic } from '@agent/medic/medic.prompt.agent'
import { schema_agent_medic } from '@agent/medic/medic.schema.agent'

export const $agent_medic = new Agent({
  id: 'medic',
  name: 'Medic',
  purpose: 'Review product facts against permitted health-related restrictions and report supported risks or missing evidence',
  instructions: prompt_agent_medic,
  model: ai_groq(process.env.AI_MEDIC_MODEL || 'openai/gpt-oss-20b'),
  tools: [
    // TODO
  ],
  memory: false,
})

export const agent_medic = async (message: string, signal?: AbortSignal) => {
  try {
    signal?.throwIfAborted()
    const result = await $agent_medic.generateText(message, {
      output: Output.object({ schema: schema_agent_medic }),
      temperature: 0,
      maxSteps: 4,
      maxRetries: 0,
      abortSignal: signal,
    })
    signal?.throwIfAborted()
    return { success: true as const, data: schema_agent_medic.parse(result.output) }
  } catch (error) {
    return { success: false as const, data: error }
  }
}
