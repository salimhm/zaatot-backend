import type { z } from 'zod'

import { createTool } from '@voltagent/core'

import {
  dto_tool_medic_nutrition_assessor,
  enum_medic_nutrition_assessor_nutrients,
} from '@tool/medic-nutrition-assessor/medic-nutrition-assessor.dto.tool'
import { schema_tool_product_lookup_nutrition, schema_tool_product_lookup_nutrition_result } from '@tool/product-lookup/product-lookup.dto.tool'
import { tool_product_lookup_nutrition_by_barcode } from '@tool/product-lookup/product-lookup.tool'

type medic_nutrition = z.infer<typeof schema_tool_product_lookup_nutrition>
type nutrition_lookup_result = z.infer<typeof schema_tool_product_lookup_nutrition_result>
type medic_nutrition_assessment = z.infer<typeof dto_tool_medic_nutrition_assessor.assessment>
type medic_nutrition_finding = medic_nutrition_assessment['findings'][number]
type assessment_basis = NonNullable<medic_nutrition_assessment['nutrition_basis']>
type core_nutrient = (typeof enum_medic_nutrition_assessor_nutrients)[number]

const ruleset = {
  id: 'uk_front_of_pack_traffic_light_v1' as const,
  name: 'UK front-of-pack traffic-light nutrient screen' as const,
  authority: 'UK Department of Health and Social Care' as const,
  reference_url: 'https://www.gov.uk/government/publications/front-of-pack-nutrition-labelling-guidance',
}

const core_nutrients = ['fat', 'saturated-fat', 'sugars', 'salt'] as const satisfies readonly core_nutrient[]

const rules: Record<assessment_basis, Record<core_nutrient, { label: string; low: number; high: number; portion_high: number }>> = {
  per_100g: {
    fat: { label: 'Total fat', low: 3, high: 17.5, portion_high: 21 },
    'saturated-fat': { label: 'Saturated fat', low: 1.5, high: 5, portion_high: 6 },
    sugars: { label: 'Total sugars', low: 5, high: 22.5, portion_high: 27 },
    salt: { label: 'Salt', low: 0.3, high: 1.5, portion_high: 1.8 },
  },
  per_100ml: {
    fat: { label: 'Total fat', low: 1.5, high: 8.75, portion_high: 10.5 },
    'saturated-fat': { label: 'Saturated fat', low: 0.75, high: 2.5, portion_high: 3 },
    sugars: { label: 'Total sugars', low: 2.5, high: 11.25, portion_high: 13.5 },
    salt: { label: 'Salt', low: 0.3, high: 0.75, portion_high: 0.9 },
  },
}

const source_is_current = (nutrition: medic_nutrition) =>
  nutrition.sources.length > 0 &&
  nutrition.sources.every((source) => {
    if (source.fresh_until === null) return true
    const fresh_until = Date.parse(source.fresh_until)
    return Number.isFinite(fresh_until) && fresh_until > Date.now()
  })

const grams_from = (value: number, unit: string): number | null => {
  const normalized_unit = unit.trim().toLocaleLowerCase('en-US')
  if (normalized_unit === 'g') return value
  if (normalized_unit === 'mg') return value / 1_000
  if (normalized_unit === 'kg') return value * 1_000
  return null
}

type normalized_measurement = {
  value_g: number
  source_value: number
  source_unit: string
  nutrient_index: number
}

const measurements_for = (nutrition: medic_nutrition, basis: assessment_basis, nutrient: core_nutrient): normalized_measurement[] =>
  nutrition.nutrients.flatMap((measurement, nutrient_index) => {
    if (measurement.code !== nutrient || measurement.basis !== basis) return []
    const value_g = grams_from(measurement.value, measurement.unit)
    return value_g === null ? [] : [{ value_g, source_value: measurement.value, source_unit: measurement.unit, nutrient_index }]
  })

const single_measurement_for = (nutrition: medic_nutrition, basis: assessment_basis, nutrient: core_nutrient): normalized_measurement | null => {
  const measurements = measurements_for(nutrition, basis, nutrient)
  if (measurements.length === 0) return null

  const [first] = measurements
  if (!first || measurements.some((measurement) => measurement.value_g !== first.value_g)) return null
  return first
}

const available_nutrients_for = (nutrition: medic_nutrition, basis: assessment_basis) =>
  core_nutrients.filter((nutrient) => single_measurement_for(nutrition, basis, nutrient) !== null)

const select_basis = (nutrition: medic_nutrition): assessment_basis | null => {
  const candidates = (['per_100g', 'per_100ml'] as const).map((basis) => ({ basis, available: available_nutrients_for(nutrition, basis) }))
  const complete = candidates.filter((candidate) => candidate.available.length === core_nutrients.length)
  if (complete.length === 1) return complete[0]!.basis
  if (complete.length > 1) return null

  const maximum_available = Math.max(...candidates.map((candidate) => candidate.available.length))
  if (maximum_available === 0) return null
  const strongest = candidates.filter((candidate) => candidate.available.length === maximum_available)
  return strongest.length === 1 ? strongest[0]!.basis : null
}

const portion_for_basis = (nutrition: medic_nutrition, basis: assessment_basis): number | null => {
  if (nutrition.serving === null) return null
  if (basis === 'per_100g' && nutrition.serving.unit.trim().toLocaleLowerCase('en-US') === 'g') return nutrition.serving.value
  if (basis === 'per_100ml' && nutrition.serving.unit.trim().toLocaleLowerCase('en-US') === 'ml') return nutrition.serving.value
  return null
}

const portion_limit_applies = (basis: assessment_basis, portion: number | null) =>
  portion !== null && (basis === 'per_100g' ? portion > 100 : portion > 150)

const create_finding = (nutrition: medic_nutrition, basis: assessment_basis, nutrient: core_nutrient): medic_nutrition_finding | null => {
  const measurement = single_measurement_for(nutrition, basis, nutrient)
  if (measurement === null) return null

  const rule = rules[basis][nutrient]
  const portion = portion_for_basis(nutrition, basis)
  const applies_portion_limit = portion_limit_applies(basis, portion)
  const exceeds_portion_limit = applies_portion_limit && portion !== null && measurement.value_g * (portion / 100) > rule.portion_high
  const level = measurement.value_g > rule.high || exceeds_portion_limit ? 'high' : measurement.value_g <= rule.low ? 'low' : 'medium'

  return {
    nutrient,
    label: rule.label,
    source_measurement: {
      value: measurement.source_value,
      unit: measurement.source_unit,
      basis,
      nutrient_index: measurement.nutrient_index,
    },
    normalized_value_g: measurement.value_g,
    level,
    threshold: {
      low_at_or_below_g_per_100: rule.low,
      high_above_g_per_100: rule.high,
      high_per_portion_above_g: rule.portion_high,
      portion_threshold_applied: applies_portion_limit,
    },
    rule_id: `${ruleset.id}.${basis}.${nutrient}`,
    evidence_ref: `nutrition.nutrients[${measurement.nutrient_index}]`,
  }
}

const base_limitations = [
  'This is a general nutrition-label screen, not a medical diagnosis, a complete dietary assessment, or a guarantee that the product is healthy for every person.',
  'The sugars finding uses verified total sugars because standard nutrition labels do not necessarily distinguish free or added sugars.',
  'The screen does not assess ingredients, allergens, micronutrients, processing level, energy balance, meal context, or personal health needs.',
]

const missing_for = (nutrition: medic_nutrition, basis: assessment_basis, missing_nutrient_codes: core_nutrient[]) => [
  ...missing_nutrient_codes.map(
    (nutrient) =>
      `A usable verified ${nutrient} measurement on the selected ${basis === 'per_100g' ? 'per 100 g' : 'per 100 ml'} basis is unavailable for the exact product variant.`,
  ),
  ...(nutrition.completeness.complete
    ? []
    : ['The provider marks the nutrition record as incomplete; only the four traffic-light nutrients are considered by this screen.']),
]

export const medic_missing_nutrition_assessment = (missing_information: string[]): medic_nutrition_assessment => ({
  status: 'insufficient_data',
  ruleset,
  variant: null,
  nutrition_basis: null,
  classification: 'inconclusive',
  findings: [],
  missing_nutrient_codes: [...core_nutrients],
  sources: [],
  missing_information,
  limitations: [...base_limitations, 'Facts from an unresolved, stale, or different product variant were not used for this screen.'],
})

export const assess_medic_nutrition = (nutrition: medic_nutrition): medic_nutrition_assessment => {
  const variant = { barcode: nutrition.variant.product_barcode, name: nutrition.variant.product_name ?? null }

  if (!source_is_current(nutrition)) {
    return {
      ...medic_missing_nutrition_assessment([
        'Current verified nutrition facts with source provenance are unavailable for the exact product variant.',
      ]),
      variant,
      sources: nutrition.sources,
    }
  }

  const basis = select_basis(nutrition)
  if (basis === null) {
    return {
      ...medic_missing_nutrition_assessment([
        'One unambiguous verified per 100 g or per 100 ml nutrition basis is required to assess the exact product variant.',
      ]),
      variant,
      sources: nutrition.sources,
    }
  }

  const findings = core_nutrients.flatMap((nutrient) => {
    const finding = create_finding(nutrition, basis, nutrient)
    return finding === null ? [] : [finding]
  })
  const found_nutrients = new Set(findings.map((finding) => finding.nutrient))
  const missing_nutrient_codes = core_nutrients.filter((nutrient) => !found_nutrients.has(nutrient))
  const has_high = findings.some((finding) => finding.level === 'high')
  const complete = missing_nutrient_codes.length === 0

  if (!complete && findings.length === 0) {
    return {
      ...medic_missing_nutrition_assessment(missing_for(nutrition, basis, [...core_nutrients])),
      variant,
      sources: nutrition.sources,
    }
  }

  if (!complete) {
    return {
      status: 'partial',
      ruleset,
      variant,
      nutrition_basis: basis,
      classification: has_high ? 'less_favourable' : 'inconclusive',
      findings,
      missing_nutrient_codes,
      sources: nutrition.sources,
      missing_information: missing_for(nutrition, basis, missing_nutrient_codes),
      limitations: base_limitations,
    }
  }

  return {
    status: 'assessed',
    ruleset,
    variant,
    nutrition_basis: basis,
    classification: has_high ? 'less_favourable' : findings.every((finding) => finding.level === 'low') ? 'favourable' : 'mixed',
    findings,
    missing_nutrient_codes: [],
    sources: nutrition.sources,
    missing_information: [],
    limitations: base_limitations,
  }
}

export type medic_nutrition_assessor_dependency = {
  lookup_nutrition_by_barcode: (barcode: string, signal?: AbortSignal) => Promise<nutrition_lookup_result>
}

const default_dependency: medic_nutrition_assessor_dependency = {
  lookup_nutrition_by_barcode: async (barcode, signal) =>
    schema_tool_product_lookup_nutrition_result.parse(
      await tool_product_lookup_nutrition_by_barcode.execute!({ barcode }, { toolContext: { abortSignal: signal } } as never),
    ),
}

const signal_from = (options: { toolContext?: { abortSignal?: AbortSignal }; abortController?: AbortController } | undefined) =>
  options?.toolContext?.abortSignal ?? options?.abortController?.signal

export const create_medic_nutrition_assessor_tool = (dependency: medic_nutrition_assessor_dependency = default_dependency) =>
  createTool({
    name: 'tool_medic_nutrition_assessor',
    description:
      'Assess one exact product barcode with the application-fixed UK front-of-pack traffic-light profile. It retrieves current verified nutrition facts, evaluates total fat, saturated fat, total sugars, and salt, and returns traceable findings or incomplete evidence. It does not assess personal medical suitability.',
    parameters: dto_tool_medic_nutrition_assessor.assess,
    outputSchema: dto_tool_medic_nutrition_assessor.assessment,
    execute: async ({ barcode }, options) => {
      const signal = signal_from(options)
      signal?.throwIfAborted()
      const lookup = await dependency.lookup_nutrition_by_barcode(barcode, signal)
      signal?.throwIfAborted()

      if (!lookup.available) {
        return medic_missing_nutrition_assessment([
          lookup.issue === 'configuration'
            ? 'The verified nutrition provider is not configured for this environment.'
            : 'The verified nutrition provider is temporarily unavailable. Try again later.',
        ])
      }
      if (lookup.data === null) {
        return medic_missing_nutrition_assessment(['Verified nutrition facts for the exact product variant are unavailable.'])
      }

      return assess_medic_nutrition(dto_tool_medic_nutrition_assessor.nutrition.parse(lookup.data))
    },
  })

export const tool_medic_nutrition_assessor = create_medic_nutrition_assessor_tool()
