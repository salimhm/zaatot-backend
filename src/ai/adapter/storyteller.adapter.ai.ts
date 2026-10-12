import type { type_schema_input_agent_storyteller } from '@agent/storyteller/storyteller.schema.agent'
import type { consumer_specialist_input, consumer_step_result } from '@ai/execution/execution-contract.ai'

import { unique_strings } from '@ai/adapter/utils.adapter.ai'
import { collect_eco_scout_sources, collect_investigator_sources } from '@ai/execution/execution-explanation.ai'
import { schema_agent_detective } from '@agent/detective/detective.schema.agent'
import { schema_agent_eco_scout } from '@agent/eco-scout/eco-scout.schema.agent'
import { schema_agent_investigator } from '@agent/investigator/investigator.schema.agent'
import { schema_agent_referee } from '@agent/referee/referee.schema.agent'
import { schema_agent_skeptic } from '@agent/skeptic/skeptic.schema.agent'
import { agent_storyteller } from '@agent/storyteller/storyteller.agent'
import { schema_agent_storyteller, schema_input_agent_storyteller } from '@agent/storyteller/storyteller.schema.agent'

const investigator_check_index = (claim_ref: string) => {
  const match = /^investigator\.checks\[(\d+)]$/.exec(claim_ref)
  return match?.[1] === undefined ? null : Number(match[1])
}

export const build_storyteller_input = (
  input: Pick<consumer_specialist_input, 'prompt' | 'dependencies' | 'feedback'>,
): type_schema_input_agent_storyteller | null => {
  const skeptic = schema_agent_skeptic.safeParse(input.dependencies.Skeptic?.output)
  const referee = schema_agent_referee.safeParse(input.dependencies.Referee?.output)
  if (!skeptic.success || !referee.success) return null

  const detective = schema_agent_detective.safeParse(input.dependencies.Detective?.output)
  const investigator = schema_agent_investigator.safeParse(input.dependencies.Investigator?.output)
  const eco_scout = schema_agent_eco_scout.safeParse(input.dependencies['Eco Scout']?.output)
  const investigator_registry = investigator.success
    ? collect_investigator_sources(investigator.data)
    : { sources: [], source_ids: [], source_ids_by_check: [] }
  const eco_scout_registry = eco_scout.success ? collect_eco_scout_sources(eco_scout.data) : { sources: [], source_ids: [] }
  const sources = [...investigator_registry.sources, ...eco_scout_registry.sources]
  const source_ids = new Set(sources.map((source) => source.id))
  const subject_data = detective.success && detective.data.status === 'identified' ? detective.data.subject : null
  const subject = subject_data?.name
    ? {
        type: subject_data.type,
        name: subject_data.name,
        brand: subject_data.type === 'brand' ? subject_data.name : subject_data.brand_name,
        barcode: subject_data.type === 'product' ? subject_data.barcode : null,
      }
    : null

  const accepted_claims = skeptic.data.accepted_claims.map((claim) => {
    const check_index = investigator_check_index(claim.claim_ref)
    const citation_ids = check_index === null ? [] : (investigator_registry.source_ids_by_check[check_index] ?? [])
    return {
      id: claim.claim_ref,
      text: claim.claim,
      qualification: claim.qualification,
      citation_ids: citation_ids.filter((id) => source_ids.has(id)),
    }
  })
  const dependency_limitations = Object.entries(input.dependencies)
    .filter(([agent]) => agent !== 'Storyteller')
    .flatMap(([, result]) => result?.limitations ?? [])
  const limitations = unique_strings([
    ...dependency_limitations,
    ...referee.data.limitations,
    ...referee.data.disagreements.map((disagreement) => disagreement.explanation),
    ...skeptic.data.stale_sources.map((source) => source.reason),
    ...skeptic.data.uncertainties.flatMap((uncertainty) => [uncertainty.issue, ...uncertainty.missing_information]),
  ])

  return schema_input_agent_storyteller.parse({
    request: input.prompt,
    subject,
    decision: referee.data.decision,
    decision_summary: referee.data.summary,
    accepted_claims,
    excluded_claims: [
      ...skeptic.data.unsupported_claims.map((claim) => ({ id: claim.claim_ref, reason: claim.reason })),
      ...referee.data.excluded_items,
    ],
    constraints: referee.data.constraints.map(({ code, action, message }) => ({ code, action, message })),
    limitations,
    sources: sources.map(({ id, provider }) => ({ id, provider })),
    repair_feedback: input.feedback?.limitations ?? [],
  })
}

// Workflow adapter: Storyteller presents reviewed facts but never changes their status.
export const adapter_storyteller = async (input: consumer_specialist_input, signal: AbortSignal): Promise<consumer_step_result> => {
  signal.throwIfAborted()
  const storyteller_input = build_storyteller_input(input)
  if (!storyteller_input) {
    return {
      status: 'needs_review',
      output: null,
      limitations: ['Storyteller requires validated Skeptic and Referee results.'],
    }
  }

  const result = await agent_storyteller(storyteller_input, signal)
  if (!result.success) throw new Error('Storyteller explanation generation failed', { cause: result.data })

  return {
    status: 'completed',
    output: schema_agent_storyteller.parse(result.data),
    limitations: [],
  }
}
