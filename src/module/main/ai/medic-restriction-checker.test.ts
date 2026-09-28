import type { consumer_specialist_input } from '@ai/execution.ai'

import { describe, expect, it, mock, spyOn } from 'bun:test'

import { adapter_medic } from '@ai/workflow.ai'
import { dto_tool_medic_nutrition_assessor } from '@tool/medic-nutrition-assessor/medic-nutrition-assessor.dto.tool'
import {
  assess_medic_restrictions,
  create_medic_restriction_checker_tool,
  medic_missing_composition_assessment,
} from '@tool/medic-restriction-checker/medic-restriction-checker.tool'

import { service_product } from '@module/main/product/product.service'

const profile = {
  goals: [],
  allergens: ['milk'],
  avoided_ingredients: ['gelatin'],
  diets: [],
}

const nutrition = dto_tool_medic_nutrition_assessor.nutrition.parse({
  variant: {
    product_id: 4,
    product_barcode: '5449000054227',
    product_name: 'Example drink',
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

const composition = {
  variant: {
    product_id: 4,
    product_barcode: '5449000054227',
    product_name: 'Example drink',
  },
  ingredients: ['water', 'gelatin'],
  allergens: ['en:milk'],
  completeness: {
    ingredients: true,
    allergens: true,
  },
  source: {
    provider: 'Verified catalog',
    url: 'https://catalog.example/products/5449000054227',
    retrieved_at: '2026-09-28T10:00:00.000Z',
    fresh_until: null,
  },
}

const medic_input = (overrides: Partial<consumer_specialist_input> = {}): consumer_specialist_input => ({
  prompt: 'Is this compatible with my restrictions?',
  execution_id: 'medic-checker-test',
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
          name: 'Example drink',
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
    'Vault Keeper': {
      status: 'completed',
      output: { profile, missing_information: [] },
      permissions: { personalization: true, history: false },
      limitations: [],
    },
  },
  candidate_review: null,
  medic_checks: ['restriction_check'],
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

describe('Medic restriction checker', () => {
  it('reports exact verified conflicts separately for allergens and avoided ingredients', () => {
    const result = assess_medic_restrictions(profile, composition)

    expect(result.status).toBe('flags_found')
    expect(result.risk_flags.map((flag) => flag.kind)).toEqual(['allergen_conflict', 'ingredient_restriction'])
    expect(result.risk_flags.map((flag) => flag.restriction)).toEqual([
      'Declared allergen restriction: milk',
      'Avoided ingredient restriction: gelatin',
    ])
    expect(result.missing_information).toEqual([])
    expect(result.required_restrictions).toEqual([
      'Preserve the declared allergen restriction for milk.',
      'Preserve the avoided-ingredient restriction for gelatin.',
    ])
  })

  it('reports possible exposure and missing evidence when the verified composition is incomplete', () => {
    const result = assess_medic_restrictions(profile, {
      ...composition,
      ingredients: ['water'],
      allergens: [],
      completeness: { ingredients: false, allergens: false },
    })

    expect(result.status).toBe('flags_found')
    expect(result.risk_flags.map((flag) => flag.kind)).toEqual(['possible_allergen_exposure', 'possible_ingredient_exposure'])
    expect(result.risk_flags.every((flag) => flag.summary.startsWith('Possible exposure:'))).toBe(true)
    expect(result.missing_information).toEqual([
      'A complete verified ingredient list is unavailable for the exact product variant.',
      'A complete verified allergen declaration is unavailable for the exact product variant.',
    ])
  })

  it('does not mark a restriction clear when no active verified composition exists', async () => {
    const find_composition_by_barcode = mock(async () => ({ data: null }))
    const tool = create_medic_restriction_checker_tool(profile, { find_composition_by_barcode })

    await expect(tool.execute!({ barcode: '5449000054227' })).resolves.toEqual(medic_missing_composition_assessment())
    expect(find_composition_by_barcode).toHaveBeenCalledWith({ barcode: '5449000054227' })
  })

  it('uses the Vault Keeper profile and Detective barcode through the workflow adapter', async () => {
    const composition_lookup = spyOn(service_product, 'find_composition_by_barcode').mockResolvedValue({ data: composition } as Awaited<
      ReturnType<typeof service_product.find_composition_by_barcode>
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
      expect((result.output as { risk_flags: Array<{ kind: string }> }).risk_flags.map((flag) => flag.kind)).toEqual([
        'allergen_conflict',
        'ingredient_restriction',
      ])
      expect(composition_lookup).toHaveBeenCalledWith({ barcode: '5449000054227' })
      expect(activities).toEqual([
        {
          name: 'tool_medic_restriction_checker',
          title: 'Checking verified allergens and ingredients',
          detail: 'Comparing the exact product variant with permitted restrictions.',
        },
      ])
    } finally {
      composition_lookup.mockRestore()
    }
  })

  it('runs a generic nutrition assessment without reading unavailable personal context or asking the LLM to choose thresholds', async () => {
    const nutrition_lookup = spyOn(service_product, 'find_nutrition_by_barcode').mockResolvedValue({ data: nutrition } as Awaited<
      ReturnType<typeof service_product.find_nutrition_by_barcode>
    >)
    const composition_lookup = spyOn(service_product, 'find_composition_by_barcode')
    const activities: unknown[] = []

    try {
      const result = await adapter_medic(
        medic_input({
          medic_checks: ['nutrition_assessment'],
          dependencies: {
            Detective: medic_input().dependencies.Detective!,
            'Vault Keeper': {
              status: 'completed',
              output: { profile: null, missing_information: ['No consented profile.'] },
              permissions: { personalization: false, history: false },
              limitations: ['No consented profile.'],
            },
          },
          use_tool: async (call, activity) => {
            activities.push(activity)
            return await call()
          },
        }),
        new AbortController().signal,
      )

      expect(result.status).toBe('completed')
      expect(result.output).toMatchObject({
        status: 'flags_found',
        mode: 'generic',
        nutrition_assessment: { status: 'assessed', classification: 'less_favourable' },
      })
      expect((result.output as { risk_flags: Array<{ kind: string; restriction: string | null }> }).risk_flags).toEqual([
        expect.objectContaining({ kind: 'clinical_rule', restriction: null }),
      ])
      expect(nutrition_lookup).toHaveBeenCalledWith({ barcode: '5449000054227' })
      expect(composition_lookup).not.toHaveBeenCalled()
      expect(activities).toEqual([
        {
          name: 'tool_medic_nutrition_assessor',
          title: 'Assessing verified nutrition label',
          detail: 'Applying the fixed nutrition-label profile to the exact product variant.',
        },
      ])
    } finally {
      nutrition_lookup.mockRestore()
      composition_lookup.mockRestore()
    }
  })

  it('preserves nutrition, restriction, and portion results in one Medic workflow output', async () => {
    const nutrition_lookup = spyOn(service_product, 'find_nutrition_by_barcode').mockResolvedValue({ data: nutrition } as Awaited<
      ReturnType<typeof service_product.find_nutrition_by_barcode>
    >)
    const composition_lookup = spyOn(service_product, 'find_composition_by_barcode').mockResolvedValue({ data: composition } as Awaited<
      ReturnType<typeof service_product.find_composition_by_barcode>
    >)

    try {
      const result = await adapter_medic(
        medic_input({
          prompt: 'Is 330 ml compatible with my restrictions and generally healthy?',
          medic_checks: ['nutrition_assessment', 'restriction_check', 'portion_calculation'],
        }),
        new AbortController().signal,
      )

      expect(result.status).toBe('completed')
      expect(result.output).toMatchObject({
        status: 'flags_found',
        mode: 'personalized',
        nutrition_assessment: { status: 'assessed', classification: 'less_favourable' },
        portion_calculation: { status: 'calculated', requested_portion: { value: 330, unit: 'ml' } },
      })
      expect((result.output as { risk_flags: Array<{ kind: string }> }).risk_flags.map((flag) => flag.kind)).toEqual([
        'clinical_rule',
        'allergen_conflict',
        'ingredient_restriction',
      ])
      expect(nutrition_lookup).toHaveBeenCalledTimes(2)
      expect(composition_lookup).toHaveBeenCalledWith({ barcode: '5449000054227' })
    } finally {
      nutrition_lookup.mockRestore()
      composition_lookup.mockRestore()
    }
  })
})
