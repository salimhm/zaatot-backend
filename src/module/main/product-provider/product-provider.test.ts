import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'

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

const spy_fetch = spyOn(globalThis, 'fetch')

afterEach(() => {
  spy_fetch.mockReset()
})

const { service_product_provider } = await import('@module/main/product-provider/product-provider.service')

describe('Product Provider Service', () => {
  it('should fetch product details from open food facts successfully', async () => {
    process.env.OPEN_FOOD_FACTS_USER_AGENT = 'test-agent'

    spy_fetch.mockImplementation((() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            status: 1,
            product: {
              product_name: 'Test Cookie',
              brands: 'CookieCorp',
              image_url: 'https://images.com/front.jpg',
              ecoscore_grade: 'a',
              nutriscore_grade: 'b',
              nova_group: 3,
              ingredients_tags: ['en:sugar', 'en:flour'],
              allergens_tags: ['en:gluten'],
            },
          }),
          { status: 200 },
        ),
      )) as any)

    const result = await service_product_provider.fetch_by_barcode('1234567890')

    expect(result).toBeDefined()
    expect(result?.product_name).toBe('Test Cookie')
    expect(result?.product_brand_name).toBe('CookieCorp')
    expect(result?.product_nova_group).toBe(3)
    expect(result?.product_ecoscore).toBe('a')
    expect(result?.product_nutriscore).toBe('b')
  })

  it('should return null when response status is 0', async () => {
    process.env.OPEN_FOOD_FACTS_USER_AGENT = 'test-agent'

    spy_fetch.mockImplementation((() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            status: 0,
          }),
          { status: 200 },
        ),
      )) as any)

    const result = await service_product_provider.fetch_by_barcode('1234567890')

    expect(result).toBeNull()
  })
})
