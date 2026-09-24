import { Agent } from '@voltagent/core'
import { Output } from 'ai'

import { ai_google } from '@ai/provider.ai'
import { prompt_agent_bait_tester } from '@agent/bait-tester/bait-tester.prompt.agent'
import { schema_agent_bait_tester } from '@agent/bait-tester/bait-tester.schema.agent'

export const $agent_bait_tester = new Agent({
  id: 'bait-tester',
  name: 'Ztroop Bait Tester',
  purpose: 'Isolate and classify untrusted external content before agent consumption',
  instructions: prompt_agent_bait_tester,
  model: ai_google(process.env.AI_BAIT_TESTER_MODEL || 'gemini-3.5-flash-lite'),
  tools: [],
  memory: false,
})

export const agent_bait_tester = async (text: string, signal?: AbortSignal) => {
  try {
    signal?.throwIfAborted()
    const result = await $agent_bait_tester.generateText(text, {
      output: Output.object({ schema: schema_agent_bait_tester }),
      temperature: 0,
      maxRetries: 0,
      abortSignal: signal,
    })
    signal?.throwIfAborted()
    return { success: true as const, data: schema_agent_bait_tester.parse(result.output) }
  } catch (error) {
    return { success: false as const, data: error }
  }
}

export const inspect_external_content = async (text: string, signal: AbortSignal): Promise<{ usable: boolean; text: string }> => {
  const result = await agent_bait_tester(text, signal)
  if (!result.success) throw new Error('Bait Tester inspection failed', { cause: result.data })

  const usable = result.data.safe && result.data.action === 'allow'
  return { usable, text: usable ? text : '' }
}
