import type { z } from 'zod'

import { createTool } from '@voltagent/core'

import { dto_tool_medic_portion_calculator, schema_tool_medic_portion_input } from '@tool/medic-portion-calculator/medic-portion-calculator.dto.tool'

import { service_product } from '@module/main/product/product.service'

type medic_portion_input = z.infer<typeof dto_tool_medic_portion_calculator.calculate>['portion']
type medic_portion = z.infer<typeof dto_tool_medic_portion_calculator.calculation>['requested_portion']
type medic_nutrition = z.infer<typeof dto_tool_medic_portion_calculator.nutrition>
type medic_portion_calculation = z.infer<typeof dto_tool_medic_portion_calculator.calculation>

export type medic_portion_calculator_dependency = Pick<typeof service_product, 'find_nutrition_by_barcode'>

const round_quantity = (value: number) => Number(value.toFixed(6))

const source_is_current = (nutrition: medic_nutrition) =>
  nutrition.sources.every((source) => {
    if (!source.fresh_until) return true
    const fresh_until = Date.parse(source.fresh_until)
    return !Number.isFinite(fresh_until) || fresh_until > Date.now()
  })

export const normalize_medic_portion = (portion: medic_portion_input): medic_portion => {
  switch (portion.unit) {
    case 'mg':
      return { value: portion.value / 1_000, unit: 'g' }
    case 'kg':
      return { value: portion.value * 1_000, unit: 'g' }
    case 'l':
      return { value: portion.value * 1_000, unit: 'ml' }
    case 'g':
      return { value: portion.value, unit: 'g' }
    case 'ml':
      return { value: portion.value, unit: 'ml' }
    case 'serving':
      return { value: portion.value, unit: 'serving' }
  }
}

export const extract_requested_medic_portion = (prompt: string): medic_portion | null => {
  const matches = [...prompt.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(mg|kg|g|ml|l|servings?)\b/gi)]
  if (matches.length !== 1) return null

  const value = Number(matches[0]![1]!.replace(',', '.'))
  const unit = matches[0]![2]!.toLocaleLowerCase('en-US').replace(/s$/, '')
  const parsed = schema_tool_medic_portion_input.safeParse({ value, unit })
  return parsed.success ? normalize_medic_portion(parsed.data) : null
}

const multiplier_for = (measurement: medic_nutrition['nutrients'][number], portion: medic_portion, serving: medic_nutrition['serving']) => {
  if (portion.unit === 'g' && measurement.basis === 'per_100g') return 2
  if (portion.unit === 'ml' && measurement.basis === 'per_100ml') return 2
  if (portion.unit === 'serving' && measurement.basis === 'per_serving') return 2

  if (
    measurement.basis === 'per_serving' &&
    serving !== null &&
    ((portion.unit === 'g' && serving.unit === 'g') || (portion.unit === 'ml' && serving.unit === 'ml'))
  ) {
    return 1
  }
  return 0
}

const factor_for = (measurement: medic_nutrition['nutrients'][number], portion: medic_portion, serving: medic_nutrition['serving']) => {
  if (measurement.basis === 'per_100g' || measurement.basis === 'per_100ml') return portion.value / 100
  if (portion.unit === 'serving') return portion.value
  if (measurement.basis === 'per_serving' && serving !== null) return portion.value / serving.value
  return null
}

export const calculate_medic_portion = (nutrition: medic_nutrition, requested_portion: medic_portion): medic_portion_calculation => {
  const base = {
    variant: {
      barcode: nutrition.variant.product_barcode,
      name: nutrition.variant.product_name,
    },
    requested_portion,
    sources: nutrition.sources,
  }

  if (!source_is_current(nutrition)) {
    return {
      status: 'insufficient_data',
      ...base,
      nutrient_quantities: [],
      unavailable_nutrient_codes: nutrition.completeness.missing_nutrient_codes,
      missing_information: [
        'Current verified nutrition facts for the exact product variant are unavailable because their freshness date has passed.',
      ],
      limitations: ['Stale nutrition facts were not used for portion calculations.'],
    }
  }

  const selected = new Map<string, { measurement: medic_nutrition['nutrients'][number]; priority: number }>()
  for (const measurement of nutrition.nutrients) {
    const priority = multiplier_for(measurement, requested_portion, nutrition.serving)
    if (priority === 0) continue
    const existing = selected.get(measurement.code)
    if (!existing || priority > existing.priority) selected.set(measurement.code, { measurement, priority })
  }

  const nutrient_quantities = [...selected.values()]
    .map(({ measurement }) => {
      const factor = factor_for(measurement, requested_portion, nutrition.serving)
      if (factor === null) return null
      return {
        code: measurement.code,
        value: round_quantity(measurement.value * factor),
        unit: measurement.unit,
        source_basis: measurement.basis,
      }
    })
    .filter((quantity): quantity is NonNullable<typeof quantity> => quantity !== null)

  const selected_codes = new Set(nutrient_quantities.map((quantity) => quantity.code))
  const unavailable_nutrient_codes = [
    ...new Set([
      ...nutrition.completeness.missing_nutrient_codes,
      ...nutrition.nutrients.filter((measurement) => !selected_codes.has(measurement.code)).map((measurement) => measurement.code),
    ]),
  ]

  if (nutrient_quantities.length === 0) {
    return {
      status: 'insufficient_data',
      ...base,
      nutrient_quantities,
      unavailable_nutrient_codes,
      missing_information: [
        'No verified nutrient measurement uses a basis compatible with the requested portion. Provide a matching mass, volume, or serving quantity.',
      ],
      limitations: ['The calculator does not convert between mass and volume because verified density data is unavailable.'],
    }
  }

  return {
    status: 'calculated',
    ...base,
    nutrient_quantities,
    unavailable_nutrient_codes,
    missing_information: [],
    limitations: [
      ...(nutrition.completeness.complete
        ? []
        : ['The exact product variant has incomplete verified nutrition facts; only available compatible nutrients were calculated.']),
      'Quantities are scaled directly from verified label measurements. No density, recipe, daily-intake, or clinical-threshold inference was applied.',
    ],
  }
}

export const medic_missing_nutrition_assessment = (requested_portion: medic_portion): medic_portion_calculation => ({
  status: 'insufficient_data',
  variant: null,
  requested_portion,
  nutrient_quantities: [],
  unavailable_nutrient_codes: [],
  sources: [],
  missing_information: ['Verified nutrition measurements for the exact product variant'],
  limitations: ['Provider estimates or nutrition facts from a different product variant were not used.'],
})

export const tool_medic_portion_calculator = createTool({
  name: 'tool_medic_portion_calculator',
  description:
    'Calculate nutrient quantities for one explicit requested portion using only active verified nutrition measurements for the exact product barcode.',
  parameters: dto_tool_medic_portion_calculator.calculate,
  outputSchema: dto_tool_medic_portion_calculator.calculation,
  execute: async ({ barcode, portion }) => {
    const nutrition_result = await service_product.find_nutrition_by_barcode({ barcode })
    const requested_portion = normalize_medic_portion(portion)
    if (!nutrition_result.data) return medic_missing_nutrition_assessment(requested_portion)

    const nutrition = dto_tool_medic_portion_calculator.nutrition.parse(nutrition_result.data)
    return calculate_medic_portion(nutrition, requested_portion)
  },
})
