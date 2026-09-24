import { createToolkit } from '@voltagent/core'
import { describe, expect, it, mock } from 'bun:test'

mock.module('@tool/product-lookup/product-lookup.tool', () => ({
  toolkit_product_lookup: createToolkit({
    name: 'mock_product_lookup',
    description: 'Mock lookup toolkit',
    tools: [],
  }),
}))

const { normalize_detective_results } = await import('@agent/detective/detective.agent')

describe('Detective response normalization', () => {
  it('returns structured local product data without inventing missing fields', () => {
    const result = normalize_detective_results([
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
    expect(result.status).toBe('identified')
    expect(result.found).toBe(true)
    expect(result.selection).toEqual({ required: false, options: [], total_options: 0 })
    expect(result.subject).toEqual({
      type: 'product',
      source: 'local_database',
      name: 'Cola',
      barcode: '5449000054227',
      brand_name: 'Example',
      brand_candidates: ['Example'],
    })
    expect(result.sources_checked).toEqual(['local_database'])
    expect(result.related_products).toEqual({
      relation: 'product_matches',
      total: 1,
      page: 1,
      page_size: 1,
      has_more: false,
      items: [
        {
          source: 'local_database',
          product_id: 1,
          barcode: '5449000054227',
          type: null,
          name: 'Cola',
          brand_name: 'Example',
          brand_candidates: ['Example'],
          images: [],
          nova_group: null,
          ecoscore: null,
          nutriscore: null,
          ingredients: null,
          allergens: null,
        },
      ],
    })
  })

  it('records both sources when Open Food Facts supplies a barcode fallback', () => {
    const result = normalize_detective_results([
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
    expect(result.related_products.items[0]).toMatchObject({
      source: 'open_food_facts',
      brand_name: 'Example',
      nova_group: 4,
      nutriscore: 'e',
      ingredients: ['water'],
      allergens: [],
    })
    expect(result.found).toBe(true)
  })

  it('selects the product-name brand while preserving all provider brand labels', () => {
    const result = normalize_detective_results([
      {
        toolName: 'tool_product_lookup_provider_by_barcode',
        output: {
          found: true,
          available: true,
          issue: null,
          source: 'open_food_facts',
          data: {
            product_barcode: '5449000054227',
            product_type: 'food',
            product_name: 'Coca-Cola Original Taste',
            product_brand_name: 'COCA-COLA SERVICES SA/NV, Coca-Cola',
            product_brand_names: ['COCA-COLA SERVICES SA/NV', 'Coca-Cola'],
          },
        },
      },
    ])

    expect(result.status).toBe('identified')
    expect(result.subject).toMatchObject({
      type: 'product',
      barcode: '5449000054227',
      brand_name: 'Coca-Cola',
      brand_candidates: ['COCA-COLA SERVICES SA/NV', 'Coca-Cola'],
    })
  })

  it('returns empty arrays for an unsuccessful lookup', () => {
    const result = normalize_detective_results([
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
      status: 'not_found',
      found: false,
      selection: { required: false, options: [], total_options: 0 },
      sources_checked: ['local_database', 'open_food_facts'],
      related_products: { relation: 'none', items: [], total: 0, page: 1, page_size: 0, has_more: false },
    })
  })

  it('returns structured brand data', () => {
    const result = normalize_detective_results([
      {
        toolName: 'tool_product_lookup_brand_by_name',
        output: { found: true, source: 'local_database', data: [{ brand_id: 7, brand_name: 'Example' }] },
      },
    ])

    expect(result.query_type).toBe('brand')
    expect(result.status).toBe('identified')
    expect(result.subject).toEqual({ type: 'brand', source: 'local_database', brand_id: 7, name: 'Example' })
    expect(result.selection).toEqual({ required: false, options: [], total_options: 0 })
    expect(result.related_products.relation).toBe('none')
  })

  it('identifies one external brand even when that brand has multiple products', () => {
    const result = normalize_detective_results([
      {
        toolName: 'tool_product_lookup_brand_by_name',
        output: { found: false, source: 'local_database', data: [] },
      },
      {
        toolName: 'tool_product_lookup_provider_by_brand_name',
        output: {
          found: true,
          source: 'open_food_facts',
          data: {
            brand_name: 'Coca-Cola',
            products: [
              { product_barcode: '5449000054227', product_name: 'Coca-Cola Original Taste', product_brand_name: 'Coca-Cola' },
              { product_barcode: '5449000131805', product_name: 'Coca-Cola Zero Sugar', product_brand_name: 'Coca-Cola' },
            ],
            total: 2238,
            page: 1,
            page_size: 5,
          },
        },
      },
    ])

    expect(result).toMatchObject({
      status: 'identified',
      query_type: 'brand',
      found: true,
      subject: { type: 'brand', source: 'open_food_facts', name: 'Coca-Cola', brand_id: null },
      selection: { required: false, options: [], total_options: 0 },
    })
    expect(result.related_products).toMatchObject({
      relation: 'brand_preview',
      total: 2238,
      page: 1,
      page_size: 5,
      has_more: true,
    })
    expect(result.related_products.items).toHaveLength(2)
  })

  it('requires selection when a product-name lookup returns multiple products', () => {
    const result = normalize_detective_results([
      {
        toolName: 'tool_product_lookup_local_by_name',
        output: { found: false, source: 'local_database', data: [] },
      },
      {
        toolName: 'tool_product_lookup_provider_by_product_name',
        output: {
          found: true,
          source: 'open_food_facts',
          data: {
            products: [
              { product_barcode: '5449000054227', product_name: 'Coca-Cola Original Taste', product_brand_name: 'Coca-Cola' },
              { product_barcode: '5449000131805', product_name: 'Coca-Cola Zero Sugar', product_brand_name: 'Coca-Cola' },
            ],
            total: 2238,
            page: 1,
            page_size: 5,
          },
        },
      },
    ])

    expect(result).toMatchObject({
      status: 'requires_selection',
      query_type: 'product',
      found: false,
      subject: null,
      selection: { required: true, total_options: 2238 },
      related_products: { relation: 'product_matches', total: 2238, page: 1, page_size: 5, has_more: true },
    })
    expect(result.selection.options).toHaveLength(2)
    expect(result.selection.options[0]).toMatchObject({ type: 'product', barcode: '5449000054227' })
  })

  it('does not claim a search happened when no tool ran', () => {
    const result = normalize_detective_results([])

    expect(result).toMatchObject({
      status: 'not_found',
      query_type: 'unknown',
      found: false,
      subject: null,
      selection: { required: false, options: [], total_options: 0 },
      sources_checked: [],
      related_products: { relation: 'none', items: [], total: 0, page: 1, page_size: 0, has_more: false },
    })
  })

  it('distinguishes provider unavailability from no matching evidence', () => {
    const result = normalize_detective_results([
      {
        toolName: 'tool_product_lookup_brand_by_name',
        output: { found: false, source: 'local_database', data: [] },
      },
      {
        toolName: 'tool_product_lookup_provider_by_brand_name',
        output: {
          found: false,
          available: false,
          issue: 'temporarily_unavailable',
          source: 'open_food_facts',
          data: null,
        },
      },
    ])

    expect(result).toMatchObject({
      status: 'unavailable',
      query_type: 'brand',
      found: false,
      subject: null,
      selection: { required: false, options: [], total_options: 0 },
      message: 'Open Food Facts is temporarily unavailable. Try again later.',
    })
  })

  it('rejects inconsistent tool results', () => {
    expect(() =>
      normalize_detective_results([
        {
          toolName: 'tool_product_lookup_local_by_name',
          output: { found: true, source: 'local_database', data: [] },
        },
      ]),
    ).toThrow('Inconsistent product lookup tool result')
  })
})
