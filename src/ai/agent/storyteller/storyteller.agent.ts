import type {
  type_schema_agent_storyteller,
  type_schema_agent_storyteller_draft,
  type_schema_input_agent_storyteller,
} from '@agent/storyteller/storyteller.schema.agent'

import { Agent } from '@voltagent/core'
import { Output } from 'ai'

import { trusted_agent_generation_options } from '@ai/generation.ai'
import { ai_cloudflare, ai_cloudflare_default_model } from '@ai/provider.ai'
import { prompt_agent_storyteller } from '@agent/storyteller/storyteller.prompt.agent'
import { schema_agent_storyteller, schema_agent_storyteller_draft, schema_input_agent_storyteller } from '@agent/storyteller/storyteller.schema.agent'

const unique_strings = (values: readonly string[]) => [...new Set(values)]

export const finalize_storyteller_output = (
  input: type_schema_input_agent_storyteller,
  draft: type_schema_agent_storyteller_draft,
): type_schema_agent_storyteller => {
  const accepted = new Map(input.accepted_claims.map((claim) => [claim.id, claim]))
  const selected_claim_ids = unique_strings(draft.selected_claim_ids)
  const selected_claims = selected_claim_ids.map((claim_id) => {
    const claim = accepted.get(claim_id)
    if (!claim) throw new Error(`Storyteller selected an unsupported claim: ${claim_id}`)
    return claim
  })
  const constraints = input.constraints.map((constraint) => constraint.message)
  const reasons = selected_claims.map((claim) => (claim.qualification ? `${claim.text} Qualification: ${claim.qualification}` : claim.text))
  const tradeoffs = unique_strings([...constraints, ...input.limitations])
  const citation_ids = unique_strings(selected_claims.flatMap((claim) => claim.citation_ids))

  return schema_agent_storyteller.parse({
    schema_version: 1,
    summary: draft.summary,
    reasons,
    tradeoffs,
    citation_ids,
  })
}

export const $agent_storyteller = new Agent({
  id: 'storyteller',
  name: 'Storyteller',
  purpose: 'Explain reviewed findings and preserved constraints without introducing new claims',
  instructions: prompt_agent_storyteller,
  model: ai_cloudflare(process.env.CF_WORKER_AI_STORYTELLER_MODEL || ai_cloudflare_default_model),
  tools: [],
  memory: false,
})

export const agent_storyteller = async (input: type_schema_input_agent_storyteller, signal?: AbortSignal) => {
  try {
    signal?.throwIfAborted()
    const parsed_input = schema_input_agent_storyteller.parse(input)
    const result = await $agent_storyteller.generateText(JSON.stringify(parsed_input), {
      ...trusted_agent_generation_options,
      output: Output.object({ schema: schema_agent_storyteller_draft }),
      temperature: 0,
      maxRetries: 0,
      abortSignal: signal,
    })
    signal?.throwIfAborted()
    const draft = schema_agent_storyteller_draft.parse(result.output)
    return { success: true as const, data: finalize_storyteller_output(parsed_input, draft) }
  } catch (error) {
    return { success: false as const, data: error }
  }
}
