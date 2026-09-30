import type { type_schema_agent_skeptic } from '@agent/skeptic/skeptic.schema.agent'

import { describe, expect, it, spyOn } from 'bun:test'

import { adapter_skeptic } from '@ai/adapter/skeptic.adapter.ai'
import { schema_agent_detective } from '@agent/detective/detective.schema.agent'
import { schema_agent_investigator } from '@agent/investigator/investigator.schema.agent'
import { schema_agent_medic } from '@agent/medic/medic.schema.agent'
import { $agent_skeptic, agent_skeptic } from '@agent/skeptic/skeptic.agent'
import { build_skeptic_ledger, finalize_skeptic_review, skeptic_source_freshness } from '@agent/skeptic/skeptic.ledger.agent'

const now = Date.parse('2026-09-29T12:00:00.000Z')

const detective = schema_agent_detective.parse({
  status: 'identified',
  query_type: 'brand',
  found: true,
  subject: { type: 'brand', source: 'local_database', name: 'Coca-Cola', brand_id: 1 },
  selection: { required: false, options: [], total_options: 0 },
  related_products: { relation: 'none', items: [], total: 0, page: 1, page_size: 0, has_more: false },
  sources_checked: ['local_database'],
  message: 'Identified Coca-Cola.',
})

const investigator = schema_agent_investigator.parse({
  subject: { brand_name: 'Coca-Cola', brand_candidates: ['Coca-Cola'], product_name: null },
  status: 'evidence_found',
  checked_at: '2026-09-29T11:59:00.000Z',
  checks: [
    {
      source: 'local_knowledge',
      status: 'matched',
      decision_status: 'boycott',
      confidence: 90,
      reason: 'Curated record.',
      matched_entity: { entity_type: 'brand', name: 'Coca-Cola', matched_name: 'Coca-Cola', match_type: 'exact', match_score: 100 },
      matched_path: [],
      citations: [{ source_name: 'Example', source_url: 'https://example.com', title: null, url: 'https://example.com/report', quote: null }],
    },
    {
      source: 'boycat',
      status: 'unavailable',
      decision_status: null,
      confidence: null,
      reason: 'The evidence service could not be reached.',
      matched_entity: null,
      matched_path: [],
      citations: [],
    },
  ],
  limitations: ['Local knowledge is a limited curated seed, not a complete ownership or boycott registry.'],
  message: 'Sourced evidence was found; a separate review must assess its significance.',
  analysis_draft: null,
})

const medic_with_source = (retrieved_at: string) =>
  schema_agent_medic.parse({
    status: 'insufficient_data',
    mode: 'generic',
    summary: 'Only sugars could be screened.',
    checked_scope: [],
    risk_flags: [],
    required_restrictions: [],
    missing_information: ['Fat, saturated fat and salt measurements'],
    limitations: ['The nutrition screen is incomplete.'],
    nutrition_assessment: {
      status: 'partial',
      ruleset: {
        id: 'uk_front_of_pack_traffic_light_v1',
        name: 'UK front-of-pack traffic-light nutrient screen',
        authority: 'UK Department of Health and Social Care',
        reference_url: 'https://www.gov.uk/government/publications/front-of-pack-nutrition-labelling-guidance',
      },
      variant: { barcode: '5449000054227', name: 'Coca-Cola Original Taste' },
      nutrition_basis: 'per_100ml',
      classification: 'inconclusive',
      findings: [
        {
          nutrient: 'sugars',
          label: 'Sugars',
          source_measurement: { value: 10.6, unit: 'g', basis: 'per_100ml', nutrient_index: 0 },
          normalized_value_g: 10.6,
          level: 'medium',
          threshold: {
            low_at_or_below_g_per_100: 2.5,
            high_above_g_per_100: 11.25,
            high_per_portion_above_g: 11.25,
            portion_threshold_applied: false,
          },
          rule_id: 'uk_fop_sugars_drink',
          evidence_ref: 'nutrition.nutrients[0]',
        },
      ],
      missing_nutrient_codes: ['fat', 'saturated-fat', 'salt'],
      sources: [{ provider: 'Open Food Facts', url: 'https://world.openfoodfacts.org/product/5449000054227', retrieved_at, fresh_until: null }],
      missing_information: ['Fat, saturated fat and salt measurements'],
      limitations: [],
    },
  })

const completed = (output: unknown) => ({ status: 'completed' as const, output, limitations: [] })

const ledger_with = (medic_retrieved_at = '2026-09-20T00:00:00.000Z') =>
  build_skeptic_ledger(
    { Detective: completed(detective), Investigator: completed(investigator), Medic: completed(medic_with_source(medic_retrieved_at)) },
    now,
    30,
  )!

const accept_all = (ledger: NonNullable<ReturnType<typeof build_skeptic_ledger>>): type_schema_agent_skeptic => ({
  status: 'reviewed',
  accepted_claims: ledger.claims.map((claim) => ({
    claim_ref: claim.id,
    claim: claim.claim,
    evidence_refs: claim.evidence_refs,
    qualification: null,
  })),
  unsupported_claims: [],
  stale_sources: [],
  uncertainties: [],
  targeted_rechecks: [],
})

describe('Skeptic evidence ledger', () => {
  it('builds claims and backend freshness from completed dependency outputs', () => {
    const ledger = ledger_with()
    expect(ledger.claims.map((claim) => claim.id)).toEqual(['detective.subject', 'investigator.checks[0]', 'medic.nutrition.findings[0]'])
    expect(ledger.claims[1]!.claim).toBe('local_knowledge matched Coca-Cola (exact match to Coca-Cola) with decision boycott.')
    expect(ledger.claims[2]!.evidence_refs).toEqual(['medic.nutrition.findings[0]', 'medic.nutrition.sources[0]'])
    const freshness = Object.fromEntries(ledger.evidence.map((record) => [record.id, record.freshness]))
    expect(freshness).toEqual({
      'detective.subject': 'not_applicable',
      'investigator.checks[0]': 'undated',
      'investigator.checks[1]': 'undated',
      'medic.nutrition.sources[0]': 'current',
      'medic.nutrition.findings[0]': 'not_applicable',
    })
    // Unusable evidence is recorded as an uncertainty, never as a claim.
    expect(ledger.known_uncertainties.map((item) => item.issue)).toEqual([
      'boycat evidence was unavailable.',
      'The nutrition screen is partial.',
      'Medic could not complete every requested check.',
    ])
  })

  it('requires one identity resolved by Detective', async () => {
    expect(build_skeptic_ledger({})).toBeNull()
    expect(build_skeptic_ledger({ Detective: completed({ ...detective, status: 'requires_selection' }) })).toBeNull()
    const generate = spyOn($agent_skeptic, 'generateText')
    try {
      const result = await adapter_skeptic({ dependencies: {} } as Parameters<typeof adapter_skeptic>[0], new AbortController().signal)
      expect(result.status).toBe('needs_input')
      expect(generate).not.toHaveBeenCalled()
    } finally {
      generate.mockRestore()
    }
  })

  it('computes freshness from expiry, age, and missing or future dates', () => {
    const at = (days_ago: number) => new Date(now - days_ago * 86_400_000).toISOString()
    expect(skeptic_source_freshness({ retrieved_at: at(1), fresh_until: null }, now, 30)).toBe('current')
    expect(skeptic_source_freshness({ retrieved_at: at(31), fresh_until: null }, now, 30)).toBe('stale')
    expect(skeptic_source_freshness({ retrieved_at: at(1), fresh_until: at(0.5) }, now, 30)).toBe('stale')
    expect(skeptic_source_freshness({ retrieved_at: 'not a date', fresh_until: null }, now, 30)).toBe('undated')
    expect(skeptic_source_freshness({ retrieved_at: at(-2), fresh_until: null }, now, 30)).toBe('undated')
  })
})

describe('Skeptic review enforcement', () => {
  it('keeps a clean review and never lets the model upgrade its status', () => {
    const ledger = ledger_with()
    const review = accept_all(ledger)
    expect(finalize_skeptic_review(ledger, review).status).toBe('reviewed')
    expect(finalize_skeptic_review(ledger, { ...review, status: 'needs_review' }).status).toBe('needs_review')
    expect(finalize_skeptic_review(ledger, { ...review, status: 'unavailable' }).status).toBe('unavailable')
  })

  it('discards invented references, restores claim text, and rejects omitted claims', () => {
    const ledger = ledger_with()
    const review = accept_all(ledger)
    const result = finalize_skeptic_review(ledger, {
      ...review,
      accepted_claims: [
        { ...review.accepted_claims[0]!, claim: 'Coca-Cola is healthy.', evidence_refs: ['detective.subject', 'invented.source'] },
        { claim_ref: 'invented.claim', claim: 'Invented', evidence_refs: ['detective.subject'], qualification: null },
      ],
      stale_sources: [{ evidence_ref: 'invented.source', reason: 'Old' }],
      targeted_rechecks: [{ claim_ref: 'invented.claim', query: 'Search', purpose: 'None' }],
    })
    expect(result.status).toBe('needs_review')
    expect(result.accepted_claims).toEqual([
      { claim_ref: 'detective.subject', claim: ledger.claims[0]!.claim, evidence_refs: ['detective.subject'], qualification: null },
    ])
    expect(result.unsupported_claims.map((claim) => [claim.claim_ref, claim.reason])).toEqual([
      ['investigator.checks[0]', 'Skeptic did not assess this claim.'],
      ['medic.nutrition.findings[0]', 'Skeptic did not assess this claim.'],
    ])
    expect(result.stale_sources).toEqual([])
    expect(result.targeted_rechecks).toEqual([])
    expect(result.uncertainties.map((item) => item.issue)).toContain('Skeptic referenced unknown claim invented.claim; it was discarded.')
  })

  it('lets a rejection win and requires acceptance to cite the attached evidence', () => {
    const ledger = ledger_with()
    const review = accept_all(ledger)
    const result = finalize_skeptic_review(ledger, {
      ...review,
      accepted_claims: review.accepted_claims.map((claim) =>
        claim.claim_ref === 'medic.nutrition.findings[0]' ? { ...claim, evidence_refs: ['detective.subject'] } : claim,
      ),
      unsupported_claims: [{ claim_ref: 'investigator.checks[0]', claim: 'x', reason: 'Citation does not name the brand.', evidence_refs: [] }],
    })
    expect(result.accepted_claims.map((claim) => claim.claim_ref)).toEqual(['detective.subject'])
    expect(result.unsupported_claims.map((claim) => [claim.claim_ref, claim.reason])).toEqual([
      ['investigator.checks[0]', 'Citation does not name the brand.'],
      ['medic.nutrition.findings[0]', 'The acceptance did not cite the evidence attached to this claim.'],
    ])
    expect(result.status).toBe('needs_review')
  })

  it('overrides the model when a claim relies only on stale evidence', () => {
    const ledger = ledger_with('2026-01-01T00:00:00.000Z')
    const result = finalize_skeptic_review(ledger, accept_all(ledger))
    expect(result.status).toBe('needs_review')
    expect(result.stale_sources.map((source) => source.evidence_ref)).toEqual(['medic.nutrition.sources[0]'])
    expect(result.unsupported_claims).toEqual([
      expect.objectContaining({ claim_ref: 'medic.nutrition.findings[0]', reason: 'Only stale evidence supports this claim.' }),
    ])
  })
})

describe('Skeptic agent', () => {
  it('sends the ledger, enforces it on the output, and maps the workflow status', async () => {
    const ledger = ledger_with()
    const generate = spyOn($agent_skeptic, 'generateText').mockResolvedValue({ output: accept_all(ledger) } as Awaited<
      ReturnType<typeof $agent_skeptic.generateText>
    >)
    try {
      const result = await agent_skeptic(ledger)
      expect(result.success).toBe(true)
      expect(JSON.parse(generate.mock.calls[0]![0] as string)).toEqual(ledger)

      generate.mockResolvedValue({ output: { status: 'reviewed' } } as Awaited<ReturnType<typeof $agent_skeptic.generateText>>)
      expect((await agent_skeptic(ledger)).success).toBe(false)
    } finally {
      generate.mockRestore()
    }
  })

  it('does not start a cancelled review', async () => {
    const controller = new AbortController()
    controller.abort()
    const generate = spyOn($agent_skeptic, 'generateText')
    try {
      expect((await agent_skeptic(ledger_with(), controller.signal)).success).toBe(false)
      expect(generate).not.toHaveBeenCalled()
    } finally {
      generate.mockRestore()
    }
  })
})
