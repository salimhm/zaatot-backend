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
  delete process.env.OPEN_FOOD_FACTS_MAX_RETRIES
  delete process.env.OPEN_FOOD_FACTS_RETRY_BASE_MS
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
    expect(result?.product_brand_names).toEqual(['CookieCorp'])
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

  it('should search Open Food Facts by product name and normalize bounded candidates', async () => {
    process.env.OPEN_FOOD_FACTS_USER_AGENT = 'test-agent'
    spy_fetch.mockImplementation(((url: string | URL | Request) => {
      const request_url = new URL(String(url))
      expect(request_url.pathname).toBe('/cgi/search.pl')
      expect(request_url.searchParams.get('search_terms')).toBe('Coca Cola')
      expect(request_url.searchParams.get('page_size')).toBe('2')
      expect(request_url.searchParams.get('page')).toBe('1')
      return Promise.resolve(
        new Response(
          JSON.stringify({
            count: 2238,
            page: 1,
            page_size: 2,
            products: [
              { code: '5449000054227', product_name: 'Coca-Cola Original Taste', brands: 'Coca-Cola' },
              { code: '5449000131805', product_name: 'Coca-Cola Zero Sugar', brands: 'Coca-Cola' },
              { code: '1234567890123', product_name: 'Extra result', brands: 'Coca-Cola' },
            ],
          }),
          { status: 200 },
        ),
      )
    }) as any)

    const result = await service_product_provider.search_by_product_name({ product_name: 'Coca Cola', take: 2 })

    expect(result).toMatchObject({ total: 2238, page: 1, page_size: 2 })
    expect(result.products).toHaveLength(2)
    expect(result.products[0]).toMatchObject({ product_barcode: '5449000054227', product_name: 'Coca-Cola Original Taste' })
  })

  it('should resolve one brand while preserving multiple associated products', async () => {
    process.env.OPEN_FOOD_FACTS_USER_AGENT = 'test-agent'
    spy_fetch.mockImplementation(((url: string | URL | Request) => {
      const request_url = new URL(String(url))
      expect(request_url.pathname).toBe('/api/v2/search')
      expect(request_url.searchParams.get('brands_tags')).toBe('coca-cola')
      expect(request_url.searchParams.get('page')).toBe('2')
      return Promise.resolve(
        new Response(
          JSON.stringify({
            count: 2238,
            page: 2,
            page_size: 5,
            products: [
              { code: '5449000054227', product_name: 'Coca-Cola Original Taste', brands: 'COCA-COLA SERVICES SA/NV, Coca-Cola' },
              { code: '5449000131805', product_name: 'Coca-Cola Zero Sugar', brands: 'Coca-Cola' },
            ],
          }),
          { status: 200 },
        ),
      )
    }) as any)

    const result = await service_product_provider.search_by_brand_name({ brand_name: 'Coca Cola', page: 2 })

    expect(result?.brand_name).toBe('Coca-Cola')
    expect(result?.products).toHaveLength(2)
    expect(result?.products[0]?.product_brand_names).toEqual(['COCA-COLA SERVICES SA/NV', 'Coca-Cola'])
    expect(result?.total).toBe(2238)
    expect(result?.page).toBe(2)
  })

  it('should not report provider rate limits as an empty search result', async () => {
    process.env.OPEN_FOOD_FACTS_USER_AGENT = 'test-agent'
    process.env.OPEN_FOOD_FACTS_RETRY_BASE_MS = '0'
    spy_fetch.mockResolvedValue(new Response(null, { status: 429 }))

    await expect(service_product_provider.search_by_product_name({ product_name: 'Coca Cola' })).rejects.toThrow(
      'Open Food Facts is temporarily unavailable',
    )
    expect(spy_fetch).toHaveBeenCalledTimes(3)
  })

  it('should retry a transient 503 and return the eventual response', async () => {
    process.env.OPEN_FOOD_FACTS_USER_AGENT = 'test-agent'
    process.env.OPEN_FOOD_FACTS_RETRY_BASE_MS = '0'
    let attempts = 0
    spy_fetch.mockImplementation((() => {
      attempts++
      if (attempts < 3) return Promise.resolve(new Response(null, { status: 503 }))
      return Promise.resolve(
        new Response(JSON.stringify({ products: [{ code: '5449000054227', product_name: 'Coca-Cola', brands: 'Coca-Cola' }] }), {
          status: 200,
        }),
      )
    }) as any)

    const result = await service_product_provider.search_by_brand_name({ brand_name: 'Coca Cola' })

    expect(result?.brand_name).toBe('Coca-Cola')
    expect(spy_fetch).toHaveBeenCalledTimes(3)
  })
})
