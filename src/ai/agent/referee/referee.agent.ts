import type { type_schema_agent_referee, type_schema_input_agent_referee } from '@agent/referee/referee.schema.agent'

import { Agent } from '@voltagent/core'
import { Output } from 'ai'

import { trusted_agent_generation_options } from '@ai/generation.ai'
import { ai_groq, ai_groq_default_model } from '@ai/provider.ai'
import { prompt_agent_referee } from '@agent/referee/referee.prompt.agent'
import { schema_agent_referee, schema_input_agent_referee } from '@agent/referee/referee.schema.agent'

const action_strength = {
  preserve: 0,
  qualify: 1,
  exclude: 2,
  block: 3,
} as const

export const validate_referee_output = (input: type_schema_input_agent_referee, output: type_schema_agent_referee): type_schema_agent_referee => {
  const claims = input.findings.flatMap((finding) => finding.claims)
  const required_constraints = [...input.policy_constraints, ...input.findings.flatMap((finding) => finding.required_constraints)]
  const allowed_references = new Set([
    ...input.findings.map((finding) => finding.id),
    ...claims.map((claim) => claim.id),
    ...claims.flatMap((claim) => claim.evidence_refs),
    ...required_constraints.map((constraint) => constraint.code),
  ])
  const allowed_claim_ids = new Set(claims.map((claim) => claim.id))
  const allowed_excluded_item_ids = new Set([...(input.skeptic?.rejected_claim_ids ?? []), ...input.candidate_ids])

  for (const constraint of output.constraints) {
    for (const source_ref of constraint.source_refs) {
      if (!allowed_references.has(source_ref)) throw new Error(`Referee returned an unsupported source reference: ${source_ref}`)
    }
  }
  for (const disagreement of output.disagreements) {
    for (const position of disagreement.positions) {
      if (!allowed_claim_ids.has(position.claim_id)) throw new Error(`Referee returned an unsupported claim ID: ${position.claim_id}`)
    }
  }
  for (const excluded of output.excluded_items) {
    if (!allowed_excluded_item_ids.has(excluded.id)) {
      throw new Error(`Referee returned an unsupported excluded item ID: ${excluded.id}`)
    }
  }

  const output_constraints = new Map(output.constraints.map((constraint) => [constraint.code, constraint]))
  for (const required of required_constraints) {
    const preserved = output_constraints.get(required.code)
    if (!preserved) throw new Error(`Referee omitted required constraint: ${required.code}`)
    if (action_strength[preserved.action] < action_strength[required.action]) {
      throw new Error(`Referee weakened required constraint: ${required.code}`)
    }
  }

  if (input.skeptic?.status !== 'completed' && output.decision !== 'needs_review') {
    throw new Error('Referee must request review when Skeptic is incomplete or unavailable')
  }

  return output
}

export const $agent_referee = new Agent({
  id: 'referee',
  name: 'Referee',
  purpose: 'Apply hard constraints and preserve unresolved disagreements after evidence review',
  instructions: prompt_agent_referee,
  model: ai_groq(process.env.GROQ_REFEREE_MODEL || ai_groq_default_model),
  tools: [],
  memory: false,
})

export const agent_referee = async (input: type_schema_input_agent_referee, signal?: AbortSignal) => {
  try {
    signal?.throwIfAborted()
    const parsed_input = schema_input_agent_referee.parse(input)
    const result = await $agent_referee.generateText(JSON.stringify(parsed_input), {
      ...trusted_agent_generation_options,
      output: Output.object({ schema: schema_agent_referee }),
      temperature: 0,
      maxRetries: 0,
      abortSignal: signal,
    })
    signal?.throwIfAborted()
    const output = schema_agent_referee.parse(result.output)
    return { success: true as const, data: validate_referee_output(parsed_input, output) }
  } catch (error) {
    return { success: false as const, data: error }
  }
}
