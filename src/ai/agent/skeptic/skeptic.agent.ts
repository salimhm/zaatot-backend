import type { skeptic_ledger } from '@agent/skeptic/skeptic.ledger.agent'

import { Agent } from '@voltagent/core'
import { Output } from 'ai'

import { trusted_agent_generation_options } from '@ai/generation.ai'
import { ai_groq, ai_groq_default_model } from '@ai/provider.ai'
import { finalize_skeptic_review } from '@agent/skeptic/skeptic.ledger.agent'
import { prompt_agent_skeptic } from '@agent/skeptic/skeptic.prompt.agent'
import { schema_agent_skeptic } from '@agent/skeptic/skeptic.schema.agent'

export const $agent_skeptic = new Agent({
  id: 'skeptic',
  name: 'Skeptic',
  purpose: 'Review supplied claims and evidence for support, relevance, freshness, and uncertainty',
  instructions: prompt_agent_skeptic,
  model: ai_groq(process.env.GROQ_SKEPTIC_MODEL || ai_groq_default_model),
  memory: false,
})

export const agent_skeptic = async (ledger: skeptic_ledger, signal?: AbortSignal) => {
  try {
    signal?.throwIfAborted()
    const result = await $agent_skeptic.generateText(JSON.stringify(ledger), {
      ...trusted_agent_generation_options,
      output: Output.object({ schema: schema_agent_skeptic }),
      temperature: 0,
      maxSteps: 1,
      maxRetries: 0,
      abortSignal: signal,
    })
    signal?.throwIfAborted()
    // The model reviews; the backend enforces the ledger boundaries on that review.
    return { success: true as const, data: finalize_skeptic_review(ledger, schema_agent_skeptic.parse(result.output)) }
  } catch (error) {
    return { success: false as const, data: error }
  }
}
