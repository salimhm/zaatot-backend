import { describe, expect, it, spyOn } from 'bun:test'

import { bargain_hunter_dimensions } from '@ai/adapter/bargain-hunter.adapter.ai'
import { $agent_bargain_hunter, agent_bargain_hunter, normalize_bargain_hunter_results } from '@agent/bargain-hunter/bargain-hunter.agent'
import { schema_agent_bargain_hunter } from '@agent/bargain-hunter/bargain-hunter.schema.agent'

const input = {
  request: 'Find boycott alternatives to Coca-Cola.',
  subject: { type: 'brand' as const, name: 'Coca-Cola', brand: 'Coca-Cola', barcode: null },
  requested_dimensions: ['boycott' as const],
  constraints: [],
  max_candidates: 2,
}

const boycat_result = {
  toolName: 'tool_alternative_lookup_boycat_by_brand',
  input: { brand_name: 'Coca-Cola' },
  output: {
    provider: 'boycat',
    provider_status: 'matched',
    requested_brand: 'Coca-Cola',
    matched_brand: 'Coca Cola',
    reason: 'Boycat returned alternatives.',
    alternatives: [
      { name: 'Barr', image_url: null, description: 'Boycat alternative brand' },
      { name: 'Barr', image_url: null, description: 'Duplicate spelling' },
      { name: 'Adirondack', image_url: 'https://example.com/ad.jpg', description: 'Boycat alternative brand' },
      { name: 'Another Cola', image_url: null, description: 'Beyond the requested candidate limit' },
    ],
    retrieved_at: '2026-10-13T10:00:00.000Z',
  },
}

const provider_result = {
  toolName: 'tool_product_lookup_provider_by_brand_name',
  input: { brand_name: 'Barr', page: 1 },
  output: {
    found: true,
    available: true,
    issue: null,
    source: 'open_food_facts',
    data: {
      brand_name: 'Barr',
      total: 1,
      page: 1,
      page_size: 5,
      products: [
        {
          product_id: null,
          product_barcode: '5000382101661',
          product_type: 'food',
          product_name: 'Barr Cola',
          brand_name: null,
          product_brand_name: 'Barr',
          product_brand_names: ['Barr'],
          product_images: ['https://images.openfoodfacts.org/example.jpg'],
          product_nova_group: 4,
          product_ecoscore: null,
          product_nutriscore: 'e',
          product_metadata: { ingredients: null, allergens: [] },
          product_packaging: null,
          nutrition: null,
        },
      ],
    },
  },
}

const empty_provider_result = {
  toolName: 'tool_product_lookup_provider_by_brand_name',
  input: { brand_name: 'Adirondack', page: 1 },
  output: {
    found: false,
    available: true,
    issue: null,
    source: 'open_food_facts',
    data: null,
  },
}

describe('Bargain Hunter normalization', () => {
  it('keeps requested comparison dimensions explicit', () => {
    expect(bargain_hunter_dimensions('Find a cheaper and healthier alternative.')).toEqual(['price', 'health'])
    expect(bargain_hunter_dimensions('Find an ethical alternative for Palestine.')).toEqual(['boycott'])
    expect(bargain_hunter_dimensions('Show me another option.')).toEqual(['boycott'])
  })

  it('keeps Boycat as the candidate source and Open Food Facts as the product resolver', () => {
    const result = normalize_bargain_hunter_results(input, [boycat_result, provider_result, empty_provider_result])

    expect(result.status).toBe('candidates_found')
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates[0]?.name).toBe('Barr')
    expect(result.candidates[0]?.source).toBe('boycat')
    expect(result.candidates[0]?.resolution_status).toBe('resolved')
    expect(result.candidates[0]?.products[0]).toMatchObject({
      barcode: '5000382101661',
      name: 'Barr Cola',
      brand_name: 'Barr',
      source: 'open_food_facts',
    })
    expect(result.candidates[1]).toMatchObject({ name: 'Adirondack', resolution_status: 'brand_only', products: [] })
    expect(result.candidates.every((candidate) => candidate.validation_status === 'pending_review')).toBe(true)
    expect(result.limitations).toContain('No price comparison was performed because no pricing provider is connected.')
    expect(schema_agent_bargain_hunter.parse(result)).toEqual(result)
  })

  it('does not call Boycat conceptually for unsupported-only dimensions', () => {
    const result = normalize_bargain_hunter_results({ ...input, requested_dimensions: ['price'], request: 'Find a cheaper option.' }, [])

    expect(result.status).toBe('insufficient_data')
    expect(result.candidates).toEqual([])
    expect(result.limitations[0]).toContain('Price-based alternative discovery is not implemented')
  })

  it('distinguishes provider unavailability from no alternatives', () => {
    const unavailable = normalize_bargain_hunter_results(input, [
      {
        ...boycat_result,
        output: { ...boycat_result.output, provider_status: 'unavailable', alternatives: [], reason: 'Boycat is unavailable.' },
      },
    ])
    const none = normalize_bargain_hunter_results(input, [{ ...boycat_result, output: { ...boycat_result.output, alternatives: [] } }])

    expect(unavailable.status).toBe('unavailable')
    expect(none.status).toBe('none_found')
  })
})

describe('Bargain Hunter agent', () => {
  it('builds its final result deterministically from completed tool results', async () => {
    const generate = spyOn($agent_bargain_hunter, 'generateText').mockResolvedValue({
      toolResults: [boycat_result, provider_result, empty_provider_result],
    } as unknown as Awaited<ReturnType<typeof $agent_bargain_hunter.generateText>>)
    try {
      const result = await agent_bargain_hunter(input)

      expect(generate).toHaveBeenCalledTimes(1)
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.candidates.map((candidate) => candidate.name)).toEqual(['Barr', 'Adirondack'])
    } finally {
      generate.mockRestore()
    }
  })

  it('honours cancellation before generation', async () => {
    const generate = spyOn($agent_bargain_hunter, 'generateText')
    const controller = new AbortController()
    try {
      controller.abort()

      const result = await agent_bargain_hunter(input, controller.signal)

      expect(result.success).toBe(false)
      expect(generate).not.toHaveBeenCalled()
    } finally {
      generate.mockRestore()
    }
  })
})
