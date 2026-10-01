import type { type_schema_agent_conductor_result } from '@agent/conductor/conductor.schema.agent'
import type { type_schema_agent_investigator } from '@agent/investigator/investigator.schema.agent'

// TEMPORARY presentation helpers used by the unresolved-result path until
// Storyteller and Gatekeeper produce the approved explanation.

export const readable_label = (value: string) => value.replaceAll('_', ' ')

export const readable_list = (values: readonly string[]) => {
  if (values.length === 0) return ''
  if (values.length === 1) return values[0]!
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`
}

const valid_source_url = (...values: Array<string | null | undefined>): string | null => {
  for (const value of values) {
    if (!value) continue
    try {
      const url = new URL(value)
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString()
    } catch {
      // Ignore malformed provider URLs instead of invalidating the complete API response.
    }
  }
  return null
}

export const summarize_investigator = (output: type_schema_agent_investigator): string => {
  const checks = output.checks.map((check) => {
    const source = readable_label(check.source)
    const entity = check.matched_entity?.name ?? output.subject.brand_name ?? 'the requested brand'
    const decision = check.decision_status ? readable_label(check.decision_status) : 'no decision'
    const confidence = check.confidence === null ? '' : `, ${check.confidence}% confidence`
    const reason = check.reason ? ` ${check.reason}` : ''

    if (check.status === 'matched') return `${source}: ${decision} for ${entity}${confidence}.${reason}`
    return `${source}: ${readable_label(check.status)}.${reason}`
  })

  return [output.message, ...checks].join(' ')
}

export const collect_investigator_sources = (output: type_schema_agent_investigator) => {
  const sources: type_schema_agent_conductor_result['sources'] = []
  const source_ids: string[] = []
  const ids_by_key = new Map<string, string>()

  for (const check of output.checks) {
    for (const citation of check.citations) {
      const url = valid_source_url(citation.url, citation.source_url)
      const provider = citation.source_name.trim() || readable_label(check.source)
      const key = `${provider}\u0000${url ?? citation.title ?? ''}`
      let id = ids_by_key.get(key)
      if (!id) {
        id = `investigator-source-${sources.length + 1}`
        ids_by_key.set(key, id)
        sources.push({ id, provider, url, retrieved_at: output.checked_at })
      }
      if (!source_ids.includes(id)) source_ids.push(id)
    }
  }

  return { sources, source_ids }
}

// TEMPORARY: replace this deterministic presenter when Storyteller/Gatekeeper are implemented.
export const build_temporary_explanation = (
  subject: NonNullable<type_schema_agent_conductor_result['subject']>,
  outcome: NonNullable<type_schema_agent_conductor_result['outcome']>,
  investigator: type_schema_agent_investigator | null,
  citation_ids: string[],
): NonNullable<type_schema_agent_conductor_result['explanation']> => {
  const summaries: Record<typeof outcome, string> = {
    evidence_found: `Boycott-related evidence was found for ${subject.name} in the sources checked by Ztroop. This is sourced evidence rather than a final independent judgment.`,
    no_matching_evidence: `No matching boycott-related evidence was found for ${subject.name} in the sources checked by Ztroop. This does not prove that the brand is safe.`,
    needs_input: `More information is required before Ztroop can investigate ${subject.name}.`,
    needs_review: `The evidence or identity associated with ${subject.name} requires review before drawing a conclusion.`,
    unavailable: `Ztroop could not check every required evidence source for ${subject.name}. Try again later.`,
  }
  const reasons = [
    ...new Set((investigator?.checks ?? []).filter((check) => check.status === 'matched' && check.reason).map((check) => check.reason as string)),
  ].slice(0, 4)

  return {
    summary: summaries[outcome],
    reasons,
    tradeoffs: investigator?.limitations ?? [],
    citation_ids,
  }
}
