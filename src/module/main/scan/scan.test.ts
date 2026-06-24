import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

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
})
