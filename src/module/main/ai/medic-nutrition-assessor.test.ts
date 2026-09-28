import type { z } from 'zod'

import { describe, expect, it } from 'bun:test'

import { dto_tool_medic_nutrition_assessor } from '@tool/medic-nutrition-assessor/medic-nutrition-assessor.dto.tool'
import {
  assess_medic_nutrition,
  create_medic_nutrition_assessor_tool,
  medic_missing_nutrition_assessment,
} from '@tool/medic-nutrition-assessor/medic-nutrition-assessor.tool'
import { schema_tool_product_lookup_nutrition_result } from '@tool/product-lookup/product-lookup.dto.tool'

type nutrition_lookup_result = z.infer<typeof schema_tool_product_lookup_nutrition_result>

const nutrition = dto_tool_medic_nutrition_assessor.nutrition.parse({
  variant: {
    product_id: 4,
    product_barcode: '5449000054227',
    product_name: 'Example cola',
  },
  serving: { value: 330, unit: 'ml' },
  nutrients: [
    { code: 'fat', value: 0, unit: 'g', basis: 'per_100ml' },
    { code: 'saturated-fat', value: 0, unit: 'g', basis: 'per_100ml' },
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
    missing_nutrient_codes: ['energy-kcal', 'carbohydrates', 'fiber', 'proteins'],
  },
})

const lookup = (data: nutrition_lookup_result['data']): nutrition_lookup_result => ({
  found: data !== null,
  available: true,
  issue: null,
  source: 'local_database',
  data,
})

describe('Medic nutrition assessor', () => {
  it('uses the verified liquid basis and serving-size cap to identify a less favourable nutrition screen', () => {
    const result = assess_medic_nutrition(nutrition)

    expect(result).toMatchObject({
      status: 'assessed',
      nutrition_basis: 'per_100ml',
      classification: 'less_favourable',
      missing_nutrient_codes: [],
      ruleset: { id: 'uk_front_of_pack_traffic_light_v1' },
    })
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nutrient: 'sugars',
          label: 'Total sugars',
          normalized_value_g: 10.6,
          level: 'high',
          threshold: expect.objectContaining({
            high_above_g_per_100: 11.25,
            high_per_portion_above_g: 13.5,
            portion_threshold_applied: true,
          }),
          evidence_ref: 'nutrition.nutrients[2]',
        }),
      ]),
    )
  })

  it('returns a favourable screen only when every core nutrient is low', () => {
    const result = assess_medic_nutrition(
      dto_tool_medic_nutrition_assessor.nutrition.parse({
        ...nutrition,
        serving: { value: 250, unit: 'ml' },
        nutrients: [
          { code: 'fat', value: 1, unit: 'g', basis: 'per_100ml' },
          { code: 'saturated-fat', value: 0.5, unit: 'g', basis: 'per_100ml' },
          { code: 'sugars', value: 2, unit: 'g', basis: 'per_100ml' },
          { code: 'salt', value: 0.2, unit: 'g', basis: 'per_100ml' },
        ],
      }),
    )

    expect(result).toMatchObject({ status: 'assessed', classification: 'favourable' })
    expect(result.findings.every((finding) => finding.level === 'low')).toBe(true)
  })

  it('keeps a high supported nutrient finding while reporting an incomplete label screen', () => {
    const result = assess_medic_nutrition(
      dto_tool_medic_nutrition_assessor.nutrition.parse({
        ...nutrition,
        nutrients: [
          { code: 'sugars', value: 12, unit: 'g', basis: 'per_100ml' },
          { code: 'salt', value: 0.02, unit: 'g', basis: 'per_100ml' },
        ],
      }),
    )

    expect(result).toMatchObject({
      status: 'partial',
      classification: 'less_favourable',
      missing_nutrient_codes: ['fat', 'saturated-fat'],
    })
    expect(result.missing_information).toContain(
      'A usable verified fat measurement on the selected per 100 ml basis is unavailable for the exact product variant.',
    )
  })

  it('refuses stale evidence and does not classify it', () => {
    const result = assess_medic_nutrition(
      dto_tool_medic_nutrition_assessor.nutrition.parse({
        ...nutrition,
        sources: [{ ...nutrition.sources[0], fresh_until: '2020-01-01T00:00:00.000Z' }],
      }),
    )

    expect(result).toMatchObject({
      status: 'insufficient_data',
      classification: 'inconclusive',
      findings: [],
      variant: { barcode: '5449000054227' },
    })
  })

  it('does not combine nutrients from per-100g and per-100ml labels', () => {
    const result = assess_medic_nutrition(
      dto_tool_medic_nutrition_assessor.nutrition.parse({
        ...nutrition,
        nutrients: [
          { code: 'fat', value: 1, unit: 'g', basis: 'per_100g' },
          { code: 'saturated-fat', value: 0.5, unit: 'g', basis: 'per_100ml' },
          { code: 'sugars', value: 2, unit: 'g', basis: 'per_100ml' },
          { code: 'salt', value: 0.2, unit: 'g', basis: 'per_100ml' },
        ],
      }),
    )

    expect(result).toMatchObject({
      status: 'partial',
      nutrition_basis: 'per_100ml',
      classification: 'inconclusive',
      missing_nutrient_codes: ['fat'],
    })
  })

  it('retrieves nutrition by exact barcode and reports a missing exact record without fabricating an assessment', async () => {
    const calls: string[] = []
    const tool = create_medic_nutrition_assessor_tool({
      lookup_nutrition_by_barcode: async (barcode) => {
        calls.push(barcode)
        return lookup(null)
      },
    })

    await expect(tool.execute!({ barcode: '5449000054227' })).resolves.toEqual(
      medic_missing_nutrition_assessment(['Verified nutrition facts for the exact product variant are unavailable.']),
    )
    expect(calls).toEqual(['5449000054227'])
  })
})
