import type { consumer_specialist_input } from '@ai/execution/execution-contract.ai'

import { describe, expect, it, spyOn } from 'bun:test'

import { adapter_medic } from '@ai/adapter/medic.adapter.ai'
import { dto_tool_medic_portion_calculator } from '@tool/medic-portion-calculator/medic-portion-calculator.dto.tool'
import { calculate_medic_portion, extract_requested_medic_portion } from '@tool/medic-portion-calculator/medic-portion-calculator.tool'

import { service_product } from '@module/main/product/product.service'

const nutrition = dto_tool_medic_portion_calculator.nutrition.parse({
  variant: {
    product_id: 4,
    product_barcode: '5449000054227',
    product_name: 'Example cola',
  },
  serving: {
    value: 330,
    unit: 'ml',
  },
  nutrients: [
    { code: 'energy-kcal', value: 42, unit: 'kcal', basis: 'per_100ml' },
    { code: 'sugars', value: 10.6, unit: 'g', basis: 'per_100ml' },
    { code: 'salt', value: 0.02, unit: 'g', basis: 'per_100ml' },
  ],
  sources: [
    {
      provider: 'Verified catalog',
      url: 'https://catalog.example/products/5449000054227',
      retrieved_at: '2026-09-28T10:00:00.000Z',
      fresh_until: null,
    },
  ],
  completeness: {
    status: 'partial',
    complete: false,
    missing_nutrient_codes: ['fat', 'proteins'],
  },
})

const medic_input = (overrides: Partial<consumer_specialist_input> = {}): consumer_specialist_input => ({
  prompt: 'How much sugar is in 250 ml?',
  execution_id: 'medic-portion-calculator-test',
  dependencies: {
    Detective: {
      status: 'completed',
      output: {
        status: 'identified',
        query_type: 'product',
        found: true,
        subject: {
          type: 'product',
          source: 'local_database',
          name: 'Example cola',
          barcode: '5449000054227',
          brand_name: 'Example',
          brand_candidates: ['Example'],
        },
        selection: { required: false, options: [], total_options: 0 },
        related_products: { relation: 'product_matches', items: [], total: 0, page: 1, page_size: 0, has_more: false },
        sources_checked: ['local_database'],
        message: 'Found the exact product.',
      },
      limitations: [],
    },
  },
  candidate_review: null,
  medic_checks: ['portion_calculation'],
  budgets: {
    timeout_ms: 1_000,
    max_tool_calls: 2,
    max_retries: 0,
    max_alternative_candidates: 0,
    max_candidate_review_passes: 0,
    max_response_repairs: 0,
  },
  use_tool: async (call) => await call(),
  inspect_content: async (text) => text,
  ...overrides,
})

describe('Medic portion calculator', () => {
  it('scales compatible verified per-100ml nutrition and preserves units and sources', () => {
    const result = calculate_medic_portion(nutrition, { value: 250, unit: 'ml' })

    expect(result).toMatchObject({
      status: 'calculated',
      variant: { barcode: '5449000054227', name: 'Example cola' },
      requested_portion: { value: 250, unit: 'ml' },
      sources: nutrition.sources,
      unavailable_nutrient_codes: ['fat', 'proteins'],
    })
    expect(result.nutrient_quantities).toEqual([
      { code: 'energy-kcal', value: 105, unit: 'kcal', source_basis: 'per_100ml' },
      { code: 'sugars', value: 26.5, unit: 'g', source_basis: 'per_100ml' },
      { code: 'salt', value: 0.05, unit: 'g', source_basis: 'per_100ml' },
    ])
    expect(result.limitations).toContain(
      'The exact product variant has incomplete verified nutrition facts; only available compatible nutrients were calculated.',
    )
  })

  it('uses a verified gram serving only when that serving measurement is compatible', () => {
    const result = calculate_medic_portion(
      dto_tool_medic_portion_calculator.nutrition.parse({
        ...nutrition,
        serving: { value: 30, unit: 'g' },
        nutrients: [{ code: 'sugars', value: 6, unit: 'g', basis: 'per_serving' }],
      }),
      { value: 45, unit: 'g' },
    )

    expect(result.status).toBe('calculated')
    expect(result.nutrient_quantities).toEqual([{ code: 'sugars', value: 9, unit: 'g', source_basis: 'per_serving' }])
  })

  it('does not convert verified mass nutrition facts into a volume estimate', () => {
    const result = calculate_medic_portion(
      dto_tool_medic_portion_calculator.nutrition.parse({
        ...nutrition,
        nutrients: [{ code: 'sugars', value: 10, unit: 'g', basis: 'per_100g' }],
      }),
      { value: 250, unit: 'ml' },
    )

    expect(result.status).toBe('insufficient_data')
    expect(result.nutrient_quantities).toEqual([])
    expect(result.missing_information).toEqual([
      'No verified nutrient measurement uses a basis compatible with the requested portion. Provide a matching mass, volume, or serving quantity.',
    ])
    expect(result.limitations).toContain('The calculator does not convert between mass and volume because verified density data is unavailable.')
  })

  it('rejects stale nutrition facts rather than calculating from them', () => {
    const result = calculate_medic_portion(
      dto_tool_medic_portion_calculator.nutrition.parse({
        ...nutrition,
        sources: [{ ...nutrition.sources[0], fresh_until: '2020-01-01T00:00:00.000Z' }],
      }),
      { value: 250, unit: 'ml' },
    )

    expect(result.status).toBe('insufficient_data')
    expect(result.nutrient_quantities).toEqual([])
    expect(result.limitations).toEqual(['Stale nutrition facts were not used for portion calculations.'])
  })

  it('extracts one explicit metric portion and leaves ambiguous requests for follow-up', () => {
    expect(extract_requested_medic_portion('How much sugar is in 0.25 l?')).toEqual({ value: 250, unit: 'ml' })
    expect(extract_requested_medic_portion('Calculate 2 servings.')).toEqual({ value: 2, unit: 'serving' })
    expect(extract_requested_medic_portion('Compare 250 ml with 330 ml.')).toBeNull()
    expect(extract_requested_medic_portion('How much sugar is there?')).toBeNull()
  })

  it('uses the exact Detective barcode through the Medic workflow without reading personal context', async () => {
    const nutrition_lookup = spyOn(service_product, 'find_nutrition_by_barcode').mockResolvedValue({ data: nutrition } as Awaited<
      ReturnType<typeof service_product.find_nutrition_by_barcode>
    >)
    const activities: unknown[] = []

    try {
      const result = await adapter_medic(
        medic_input({
          use_tool: async (call, activity) => {
            activities.push(activity)
            return await call()
          },
        }),
        new AbortController().signal,
      )

      expect(result.status).toBe('completed')
      expect(result.output).toMatchObject({
        status: 'no_flags_detected',
        mode: 'generic',
        portion_calculation: {
          status: 'calculated',
          requested_portion: { value: 250, unit: 'ml' },
          nutrient_quantities: [
            { code: 'energy-kcal', value: 105 },
            { code: 'sugars', value: 26.5 },
            { code: 'salt', value: 0.05 },
          ],
        },
      })
      expect(nutrition_lookup).toHaveBeenCalledWith({ barcode: '5449000054227' })
      expect(activities).toEqual([
        {
          name: 'tool_medic_portion_calculator',
          title: 'Calculating verified nutrient quantities',
          detail: 'Scaling verified nutrition facts for 250 ml.',
        },
      ])
    } finally {
      nutrition_lookup.mockRestore()
    }
  })
})
