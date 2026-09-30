import type { type_schema_agent_skeptic } from '@agent/skeptic/skeptic.schema.agent'
import type { consumer_specialist_input } from '@ai/execution/execution-contract.ai'

import { schema_agent_detective } from '@agent/detective/detective.schema.agent'
import { schema_agent_investigator } from '@agent/investigator/investigator.schema.agent'
import { schema_agent_medic } from '@agent/medic/medic.schema.agent'

const day_ms = 86_400_000
const default_source_max_age_days = 30

export type skeptic_freshness = 'current' | 'stale' | 'undated' | 'not_applicable'

export type skeptic_claim = { id: string; agent: string; claim: string; evidence_refs: string[] }

export type skeptic_evidence = {
  id: string
  agent: string
  record: unknown
  retrieved_at: string | null
  fresh_until: string | null
  /** Computed by the backend, never by the model. */
  freshness: skeptic_freshness
}

export type skeptic_ledger = {
  reviewed_at: string
  max_source_age_days: number
  subject: unknown
  claims: skeptic_claim[]
  evidence: skeptic_evidence[]
  /** Gaps detected in code; preserved in the review whatever the model returns. */
  known_uncertainties: type_schema_agent_skeptic['uncertainties']
  known_limitations: string[]
}

export const skeptic_source_max_age_days = () => {
  const value = Number(process.env.AI_SOURCE_MAX_AGE_DAYS)
  return Number.isInteger(value) && value > 0 ? value : default_source_max_age_days
}

const unique_strings = (values: readonly string[]) => [...new Set(values)]

const readable = (value: string) => value.replaceAll('_', ' ')

const parse_time = (value: string | null | undefined) => {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

export const skeptic_source_freshness = (
  source: { retrieved_at: string | null; fresh_until: string | null },
  now: number,
  max_age_days: number,
): skeptic_freshness => {
  const fresh_until = parse_time(source.fresh_until)
  const retrieved_at = parse_time(source.retrieved_at)
  if (fresh_until !== null && fresh_until < now) return 'stale'
  // A retrieval time in the future cannot establish freshness.
  if (retrieved_at === null || retrieved_at > now) return fresh_until !== null ? 'current' : 'undated'
  return now - retrieved_at > max_age_days * day_ms ? 'stale' : 'current'
}

/**
 * Builds the closed-world evidence ledger reviewed by Skeptic from completed dependency outputs.
 * Returns null when Detective has not resolved exactly one subject.
 */
export const build_skeptic_ledger = (
  dependencies: consumer_specialist_input['dependencies'],
  now = Date.now(),
  max_age_days = skeptic_source_max_age_days(),
): skeptic_ledger | null => {
  const detective = schema_agent_detective.safeParse(dependencies.Detective?.output)
  if (!detective.success || detective.data.status !== 'identified' || !detective.data.subject) return null

  const subject = detective.data.subject
  const claims: skeptic_claim[] = []
  const evidence: skeptic_evidence[] = []
  const known_uncertainties: skeptic_ledger['known_uncertainties'] = []
  const add_source = (id: string, agent: string, source: { retrieved_at: string; fresh_until: string | null }, record: unknown) => {
    evidence.push({
      id,
      agent,
      record,
      retrieved_at: source.retrieved_at,
      fresh_until: source.fresh_until,
      freshness: skeptic_source_freshness(source, now, max_age_days),
    })
    return id
  }
  const add_record = (id: string, agent: string, record: unknown, freshness: skeptic_freshness) => {
    evidence.push({ id, agent, record, retrieved_at: null, fresh_until: null, freshness })
    return id
  }

  add_record('detective.subject', 'Detective', { subject, sources_checked: detective.data.sources_checked }, 'not_applicable')
  claims.push({
    id: 'detective.subject',
    agent: 'Detective',
    claim: `Detective resolved the requested ${subject.type} as ${subject.name ?? 'an unnamed product'}.`,
    evidence_refs: ['detective.subject'],
  })

  const investigator = schema_agent_investigator.safeParse(dependencies.Investigator?.output)
  if (investigator.success) {
    const brand = investigator.data.subject.brand_name ?? 'the resolved brand'
    for (const [index, check] of investigator.data.checks.entries()) {
      const id = `investigator.checks[${index}]`
      // Lookup time is not publication time, so provider evidence stays undated.
      add_record(id, 'Investigator', { ...check, checked_at: investigator.data.checked_at }, 'undated')
      if (check.status === 'matched') {
        const entity = check.matched_entity
        const decision = check.decision_status ? readable(check.decision_status) : 'no decision'
        claims.push({
          id,
          agent: 'Investigator',
          claim: entity
            ? `${check.source} matched ${entity.name} (${readable(entity.match_type)} match to ${brand}) with decision ${decision}.`
            : `${check.source} matched ${brand} with decision ${decision}.`,
          evidence_refs: [id],
        })
      } else if (check.status === 'not_found') {
        claims.push({ id, agent: 'Investigator', claim: `${check.source} returned no matching record for ${brand}.`, evidence_refs: [id] })
      } else {
        known_uncertainties.push({
          claim_ref: null,
          issue: `${check.source} evidence was ${readable(check.status)}.`,
          missing_information: [`A usable ${check.source} result for ${brand}`],
        })
      }
    }
  }

  const medic = schema_agent_medic.safeParse(dependencies.Medic?.output)
  if (medic.success) {
    const nutrition = medic.data.nutrition_assessment
    const nutrition_source_ids = (nutrition?.sources ?? []).map((source, index) =>
      add_source(`medic.nutrition.sources[${index}]`, 'Medic', source, source),
    )
    for (const [index, finding] of (nutrition?.findings ?? []).entries()) {
      const id = add_record(`medic.nutrition.findings[${index}]`, 'Medic', finding, 'not_applicable')
      const measurement = finding.source_measurement
      claims.push({
        id,
        agent: 'Medic',
        claim: `${finding.label} is ${measurement.value} ${measurement.unit} ${readable(measurement.basis)}, rated ${finding.level} under ${finding.rule_id}.`,
        evidence_refs: [id, ...nutrition_source_ids],
      })
    }
    if (nutrition && nutrition.status !== 'assessed') {
      known_uncertainties.push({
        claim_ref: null,
        issue: `The nutrition screen is ${readable(nutrition.status)}.`,
        missing_information: nutrition.missing_information,
      })
    }

    for (const [index, flag] of medic.data.risk_flags.entries()) {
      const id = add_record(`medic.risk_flags[${index}]`, 'Medic', flag, 'not_applicable')
      claims.push({
        id,
        agent: 'Medic',
        claim: flag.summary,
        evidence_refs: [id, ...(flag.kind === 'clinical_rule' ? nutrition_source_ids : [])],
      })
    }

    const portion = medic.data.portion_calculation
    if (portion?.status === 'calculated') {
      const portion_source_ids = portion.sources.map((source, index) =>
        add_source(`medic.portion.sources[${index}]`, 'Medic', { retrieved_at: source.retrieved_at, fresh_until: source.fresh_until }, source),
      )
      for (const [index, quantity] of portion.nutrient_quantities.entries()) {
        const id = add_record(`medic.portion.nutrient_quantities[${index}]`, 'Medic', quantity, 'not_applicable')
        claims.push({
          id,
          agent: 'Medic',
          claim: `${portion.requested_portion.value} ${portion.requested_portion.unit} contains ${quantity.value} ${quantity.unit} of ${quantity.code}.`,
          evidence_refs: [id, ...portion_source_ids],
        })
      }
    }
    if (medic.data.missing_information.length > 0) {
      known_uncertainties.push({
        claim_ref: null,
        issue: 'Medic could not complete every requested check.',
        missing_information: medic.data.missing_information,
      })
    }
  }

  return {
    reviewed_at: new Date(now).toISOString(),
    max_source_age_days: max_age_days,
    subject,
    claims,
    evidence,
    known_uncertainties,
    known_limitations: unique_strings(Object.values(dependencies).flatMap((step) => step?.limitations ?? [])),
  }
}

/**
 * Enforces the closed-world ledger on a model review: unknown references are discarded,
 * claim text is restored from the ledger, every claim is assessed exactly once, and
 * backend freshness decisions override the model. The model can never upgrade the status.
 */
export const finalize_skeptic_review = (ledger: skeptic_ledger, review: type_schema_agent_skeptic): type_schema_agent_skeptic => {
  const claims = new Map(ledger.claims.map((claim) => [claim.id, claim]))
  const evidence = new Map(ledger.evidence.map((record) => [record.id, record]))
  const corrections: string[] = []
  const assessed = new Set<string>()
  const known_evidence = (refs: readonly string[]) => unique_strings(refs.filter((ref) => evidence.has(ref)))

  const unsupported_claims: type_schema_agent_skeptic['unsupported_claims'] = []
  for (const item of review.unsupported_claims) {
    const claim = claims.get(item.claim_ref)
    if (!claim) {
      corrections.push(`Skeptic referenced unknown claim ${item.claim_ref}; it was discarded.`)
      continue
    }
    if (assessed.has(claim.id)) continue
    assessed.add(claim.id)
    unsupported_claims.push({ claim_ref: claim.id, claim: claim.claim, reason: item.reason, evidence_refs: known_evidence(item.evidence_refs) })
  }

  const accepted_claims: type_schema_agent_skeptic['accepted_claims'] = []
  const reject = (claim: skeptic_claim, reason: string, refs: string[]) => {
    unsupported_claims.push({ claim_ref: claim.id, claim: claim.claim, reason, evidence_refs: refs })
  }
  for (const item of review.accepted_claims) {
    const claim = claims.get(item.claim_ref)
    if (!claim) {
      corrections.push(`Skeptic referenced unknown claim ${item.claim_ref}; it was discarded.`)
      continue
    }
    // A rejection wins over a conflicting acceptance of the same claim.
    if (assessed.has(claim.id)) continue
    assessed.add(claim.id)
    const refs = known_evidence(item.evidence_refs)
    const dated = refs.map((ref) => evidence.get(ref)!).filter((record) => record.freshness === 'current' || record.freshness === 'stale')
    if (!refs.some((ref) => claim.evidence_refs.includes(ref))) {
      corrections.push(`Skeptic accepted ${claim.id} without citing its attached evidence.`)
      reject(claim, 'The acceptance did not cite the evidence attached to this claim.', refs)
    } else if (dated.length > 0 && dated.every((record) => record.freshness === 'stale')) {
      reject(claim, 'Only stale evidence supports this claim.', refs)
    } else {
      accepted_claims.push({ claim_ref: claim.id, claim: claim.claim, evidence_refs: refs, qualification: item.qualification })
    }
  }

  for (const claim of ledger.claims) {
    if (assessed.has(claim.id)) continue
    corrections.push(`Skeptic did not assess ${claim.id}.`)
    reject(claim, 'Skeptic did not assess this claim.', [])
  }

  const stale_sources: type_schema_agent_skeptic['stale_sources'] = ledger.evidence
    .filter((record) => record.freshness === 'stale')
    .map((record) => ({
      evidence_ref: record.id,
      reason: `Source is past its freshness date or older than ${ledger.max_source_age_days} days.`,
    }))
  for (const item of review.stale_sources) {
    if (evidence.has(item.evidence_ref) && !stale_sources.some((source) => source.evidence_ref === item.evidence_ref)) stale_sources.push(item)
  }

  const uncertainties: type_schema_agent_skeptic['uncertainties'] = [
    ...ledger.known_uncertainties,
    ...review.uncertainties.map((item) => ({ ...item, claim_ref: item.claim_ref && claims.has(item.claim_ref) ? item.claim_ref : null })),
    ...corrections.map((issue) => ({ claim_ref: null, issue, missing_information: [] })),
  ]

  const cited_stale = stale_sources.some((source) => ledger.claims.some((claim) => claim.evidence_refs.includes(source.evidence_ref)))
  const status: type_schema_agent_skeptic['status'] =
    review.status === 'unavailable'
      ? 'unavailable'
      : review.status === 'needs_review' || corrections.length > 0 || cited_stale
        ? 'needs_review'
        : 'reviewed'

  return {
    status,
    accepted_claims,
    unsupported_claims,
    stale_sources,
    uncertainties,
    targeted_rechecks: review.targeted_rechecks.filter((item) => claims.has(item.claim_ref)),
  }
}
