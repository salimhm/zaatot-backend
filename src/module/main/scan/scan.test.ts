import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

import { service_boycott_provider } from '@module/main/boycott-provider/boycott-provider.service'
import { service_brand } from '@module/main/brand/brand.service'
import { service_product_provider } from '@module/main/product-provider/product-provider.service'
import { service_product } from '@module/main/product/product.service'
import { service_scan } from '@module/main/scan/scan.service'
import { service_scan_history } from '@module/user/scan-history/scan-history.service'

const mock_redis = {
  get: mock(() => Promise.resolve(null)),
  set: mock(() => Promise.resolve('OK')),
  del: mock(() => Promise.resolve(1)),
}

mock.module('@db/client.db', () => ({
  db_client: mock(() => ({})),
  db_redis_auth: mock_redis,
  db_redis_tenant_access: mock_redis,
  db_redis_migration_lock: mock_redis,
  db_redis_rate_limiting: mock_redis,
  get_tenant_type: (tenant_id: number, payload: any) => payload?.tenants?.find((t: any) => t.tenant_id === tenant_id)?.tenant_type || 'organization',
  get_tenant_url: () => 'mock-tenant-url',
  close_all_connections: () => {},
}))

beforeEach(() => {
  spyOn(service_product_provider, 'fetch_by_barcode').mockImplementation(() =>
    Promise.resolve({
      product_barcode: '1234567890',
      product_type: 'food',
      product_name: 'test-product',
      product_brand_name: 'test-brand',
      product_brand_names: ['test-brand'],
      product_images: null,
      product_nova_group: null,
      product_ecoscore: null,
      product_nutriscore: null,
      product_metadata: null,
    }),
  )

  spyOn(service_brand, 'find_or_create_by_name').mockImplementation(() =>
    Promise.resolve({
      brand_id: 1,
      brand_name: 'test-brand',
      brand_is_boycotted: false,
      brand_boycott_reasons: [],
      brand_boycott_alternatives: [],
      created_at: new Date().toISOString(),
    }),
  )

  spyOn(service_brand, 'update').mockImplementation(() =>
    Promise.resolve({
      data: {
        brand_id: 1,
        brand_name: 'test-brand',
        brand_is_boycotted: true,
        brand_boycott_reasons: ['test reason'],
        brand_boycott_alternatives: ['alternative-brand'],
        created_at: new Date().toISOString(),
      },
    } as any),
  )

  spyOn(service_boycott_provider, 'decide').mockImplementation(() =>
    Promise.resolve({
      data: {
        provider: 'boycat',
        provider_status: 'matched',
        decision_status: 'boycott',
        confidence: 100,
        reason: 'test reason',
        matched_entity: {
          entity_type: 'brand',
          name: 'test-brand',
          matched_name: 'test-brand',
          match_type: 'exact',
          match_score: 100,
        },
        campaigns: [],
        sources: [],
        alternatives: [{ name: 'alternative-brand', description: 'Boycat alternative brand' }],
      },
    }),
  )

  spyOn(service_boycott_provider, 'search').mockImplementation(() =>
    Promise.resolve({
      data: {
        provider: 'boycat',
        provider_status: 'matched',
        query: 'coc',
        results: [
          {
            brand_name: 'Coca Cola',
            campaign_name: 'Watermelon',
            campaign_tier: 1,
            decision_status: 'boycott',
            confidence: 100,
            reason: 'Boycat returned Watermelon campaign tier 1 for Coca Cola.',
          },
        ],
      },
    }),
  )

  spyOn(service_scan_history, 'create').mockImplementation(() => Promise.resolve({} as any))
})

afterEach(() => {
  mock.restore()
})

describe('Scan Service', () => {
  it('should return scanned product from cache when exists', async () => {
    spyOn(service_product, 'find').mockImplementation(
      () =>
        Promise.resolve({
          page: 1,
          take: 12,
          rows: null,
          pages: null,
          data: [
            {
              product_id: 1,
              product_barcode: '1234567890',
              product_type: 'food',
              product_name: 'test-product',
              brand_id: 1,
              product_nova_group: null,
              product_ecoscore: null,
              product_nutriscore: null,
              product_metadata: null,
              brand_name: 'test-brand',
              brand_is_boycotted: false,
              brand_boycott_reasons: [],
              brand_boycott_alternatives: [],
            },
          ],
        }) as any,
    )

    const result = await service_scan.scan_barcode({ barcode: '1234567890' }, { user_id: 1 })

    expect(result.data).toBeDefined()
    expect(result.data.source).toBe('cache')
    expect(result.data.product?.product_name).toBe('test-product')
  })

  it('should fetch from provider when product is not cached', async () => {
    spyOn(service_product, 'find').mockImplementation(
      () =>
        Promise.resolve({
          page: 1,
          take: 12,
          rows: null,
          pages: null,
          data: [],
        }) as any,
    )

    spyOn(service_product, 'create').mockImplementation(() =>
      Promise.resolve({
        data: {
          product_id: 1,
          product_barcode: '1234567890',
          product_type: 'food',
          product_name: 'test-product',
          brand_id: 1,
          product_nova_group: null,
          product_ecoscore: null,
          product_nutriscore: null,
          product_metadata: null,
          brand_name: 'test-brand',
          brand_is_boycotted: false,
          brand_boycott_reasons: [],
          brand_boycott_alternatives: [],
        } as any,
      }),
    )

    const result = await service_scan.scan_barcode({ barcode: '1234567890' }, { user_id: 1 })

    expect(result.data).toBeDefined()
    expect(result.data.source).toBe('provider')
    expect(result.data.product?.product_name).toBe('test-product')
    expect(result.data.product?.brand_name).toBe('test-brand')
  })

  it('should identify a numeric barcode and return product with boycott decision', async () => {
    spyOn(service_product, 'find').mockImplementation(
      () =>
        Promise.resolve({
          page: 1,
          take: 12,
          rows: null,
          pages: null,
          data: [
            {
              product_id: 1,
              product_barcode: '1234567890',
              product_type: 'food',
              product_name: 'test-product',
              brand_id: 1,
              product_nova_group: null,
              product_ecoscore: null,
              product_nutriscore: null,
              product_metadata: null,
              brand_name: 'test-brand',
              brand_is_boycotted: false,
              brand_boycott_reasons: [],
              brand_boycott_alternatives: [],
            },
          ],
        }) as any,
    )

    const result = await service_scan.identify({ scan_value: '1234567890' }, { user_id: 1 })

    expect(result.data.scan.scan_type).toBe('barcode')
    expect(result.data.scan.barcode).toBe('1234567890')
    expect(result.data.source.product).toBe('cache')
    expect(result.data.source.boycott).toBe('provider')
    expect(result.data.product?.product_name).toBe('test-product')
    expect(result.data.boycott_decision?.decision_status).toBe('boycott')
    expect(result.data.boycott_search).toBeNull()
  })

  it('should extract a barcode from a product URL QR value', async () => {
    spyOn(service_product, 'find').mockImplementation(
      () =>
        Promise.resolve({
          page: 1,
          take: 12,
          rows: null,
          pages: null,
          data: [],
        }) as any,
    )

    spyOn(service_product, 'create').mockImplementation(() =>
      Promise.resolve({
        data: {
          product_id: 1,
          product_barcode: '1234567890',
          product_type: 'food',
          product_name: 'test-product',
          brand_id: 1,
          product_nova_group: null,
          product_ecoscore: null,
          product_nutriscore: null,
          product_metadata: null,
          brand_name: 'test-brand',
          brand_is_boycotted: false,
          brand_boycott_reasons: [],
          brand_boycott_alternatives: [],
        } as any,
      }),
    )

    const result = await service_scan.identify({ scan_value: 'https://world.openfoodfacts.org/product/1234567890/test-product' }, { user_id: 1 })

    expect(result.data.scan.scan_type).toBe('url')
    expect(result.data.scan.barcode).toBe('1234567890')
    expect(result.data.source.product).toBe('provider')
    expect(result.data.product?.product_barcode).toBe('1234567890')
    expect(result.data.boycott_decision?.reason).toBe('test reason')
  })

  it('should search Boycat for a canonical brand when OpenFoodFacts returns a brand list', async () => {
    spyOn(service_product, 'find').mockImplementation(
      () =>
        Promise.resolve({
          page: 1,
          take: 12,
          rows: null,
          pages: null,
          data: [
            {
              product_id: 1,
              product_barcode: '5449000054227',
              product_type: 'food',
              product_name: 'Coca-Cola Original Taste',
              brand_id: 1,
              product_nova_group: 4,
              product_ecoscore: null,
              product_nutriscore: 'e',
              product_metadata: null,
              brand_name: 'coca cola life, coca-cola',
              brand_is_boycotted: false,
              brand_boycott_reasons: [],
              brand_boycott_alternatives: [],
            },
          ],
        }) as any,
    )

    const spy_decide = spyOn(service_boycott_provider, 'decide').mockImplementation((body: any) => {
      if (body.brand_name === 'Coca Cola') {
        return Promise.resolve({
          data: {
            provider: 'boycat',
            provider_status: 'matched',
            decision_status: 'boycott',
            confidence: 100,
            reason: 'Coca Cola boycott reason.',
            matched_entity: {
              entity_type: 'brand',
              name: 'Coca Cola',
              matched_name: 'Coca Cola',
              match_type: 'exact',
              match_score: 100,
            },
            campaigns: [],
            sources: [],
            alternatives: [],
          },
        })
      }

      return Promise.resolve({
        data: {
          provider: 'boycat',
          provider_status: 'not_found',
          decision_status: 'unknown',
          confidence: 0,
          reason: 'Boycat did not return details for this brand or product.',
          matched_entity: null,
          campaigns: [],
          sources: [],
          alternatives: [],
        },
      })
    })

    const spy_search = spyOn(service_boycott_provider, 'search').mockImplementation((body: any) =>
      Promise.resolve({
        data: {
          provider: 'boycat',
          provider_status: 'matched',
          query: body.query,
          results: [
            {
              brand_name: 'Coca Cola',
              campaign_name: 'Watermelon',
              campaign_tier: 1,
              decision_status: 'boycott',
              confidence: 100,
              reason: 'Boycat returned Watermelon campaign tier 1 for Coca Cola.',
            },
          ],
        },
      }),
    )

    const result = await service_scan.identify({ scan_value: '5449000054227' }, { user_id: 1 })

    expect(result.data.boycott_decision?.provider_status).toBe('matched')
    expect(result.data.boycott_decision?.decision_status).toBe('boycott')
    expect(result.data.boycott_decision?.matched_entity?.name).toBe('Coca Cola')
    expect(spy_decide).toHaveBeenCalledWith(
      expect.objectContaining({
        brand_name: 'coca cola life, coca-cola',
      }),
    )
    expect(spy_search).toHaveBeenCalled()
    expect(spy_decide).toHaveBeenCalledWith(
      expect.objectContaining({
        brand_name: 'Coca Cola',
      }),
    )
  })

  it('should return boycott search candidates for plain text scanner output', async () => {
    const result = await service_scan.identify({ scan_value: 'coc' }, { user_id: 1 })

    expect(result.data.scan.scan_type).toBe('text')
    expect(result.data.product).toBeNull()
    expect(result.data.boycott_decision).toBeNull()
    expect(result.data.boycott_search?.results[0]?.brand_name).toBe('Coca Cola')
    expect(result.data.source.boycott).toBe('search')
  })
})
