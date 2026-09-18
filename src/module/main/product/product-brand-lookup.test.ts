import { createToolkit } from '@voltagent/core'
import { describe, expect, it, mock } from 'bun:test'

mock.module('@tool/product-lookup/product-lookup.tool', () => ({
  toolkit_product_lookup: createToolkit({
    name: 'mock_product_lookup',
    description: 'Mock lookup toolkit',
    tools: [],
  }),
}))

const { normalize_product_brand_lookup_results } = await import('@agent/product-brand-lookup/product-brand-lookup.agent')

describe('Product and brand lookup agent response', () => {
  it('returns structured local product data without inventing missing fields', () => {
    const result = normalize_product_brand_lookup_results([
      {
        toolName: 'tool_product_lookup_local_by_barcode',
        output: {
          found: true,
          source: 'local_database',
          data: [{ product_id: 1, product_barcode: '5449000054227', product_name: 'Cola', brand_name: 'Example' }],
        },
      },
    ])

    expect(result.query_type).toBe('product')
    expect(result.found).toBe(true)
    expect(result.sources_checked).toEqual(['local_database'])
    expect(result.products).toEqual([
      {
        source: 'local_database',
        product_id: 1,
        barcode: '5449000054227',
        type: null,
        name: 'Cola',
        brand_name: 'Example',
        images: [],
        nova_group: null,
        ecoscore: null,
        nutriscore: null,
        ingredients: null,
        allergens: null,
      },
    ])
  })

  it('records both sources when Open Food Facts supplies a barcode fallback', () => {
    const result = normalize_product_brand_lookup_results([
      {
        toolName: 'tool_product_lookup_local_by_barcode',
        output: { found: false, source: 'local_database', data: [] },
      },
      {
        toolName: 'tool_product_lookup_provider_by_barcode',
        output: {
          found: true,
          source: 'open_food_facts',
          data: {
            product_barcode: '5449000054227',
            product_type: 'food',
            product_name: 'Cola',
            product_brand_name: 'Example',
            product_images: ['https://example.com/front.jpg'],
            product_nova_group: 4,
            product_nutriscore: 'e',
            product_metadata: { ingredients: ['water'], allergens: [] },
          },
        },
      },
    ])

    expect(result.sources_checked).toEqual(['local_database', 'open_food_facts'])
    expect(result.products[0]).toMatchObject({
      source: 'open_food_facts',
      brand_name: 'Example',
      nova_group: 4,
      nutriscore: 'e',
      ingredients: ['water'],
      allergens: [],
    })
    expect(result.found).toBe(true)
  })

  it('returns empty arrays for an unsuccessful lookup', () => {
    const result = normalize_product_brand_lookup_results([
      {
        toolName: 'tool_product_lookup_local_by_barcode',
        output: { found: false, source: 'local_database', data: [] },
      },
      {
        toolName: 'tool_product_lookup_provider_by_barcode',
        output: { found: false, source: 'open_food_facts', data: null },
      },
    ])

    expect(result).toMatchObject({
      query_type: 'product',
      found: false,
      sources_checked: ['local_database', 'open_food_facts'],
      products: [],
      brands: [],
    })
  })

  it('returns structured brand data', () => {
    const result = normalize_product_brand_lookup_results([
      {
        toolName: 'tool_product_lookup_brand_by_name',
        output: { found: true, source: 'local_database', data: [{ brand_id: 7, brand_name: 'Example' }] },
      },
    ])

    expect(result.query_type).toBe('brand')
    expect(result.brands).toEqual([{ source: 'local_database', brand_id: 7, name: 'Example' }])
  })

  it('does not claim a search happened when no tool ran', () => {
    const result = normalize_product_brand_lookup_results([])

    expect(result).toMatchObject({ query_type: 'unknown', found: false, sources_checked: [], products: [], brands: [] })
  })

  it('rejects inconsistent tool results', () => {
    expect(() =>
      normalize_product_brand_lookup_results([
        {
          toolName: 'tool_product_lookup_local_by_name',
          output: { found: true, source: 'local_database', data: [] },
        },
      ]),
    ).toThrow('Inconsistent product lookup tool result')
  })
})
