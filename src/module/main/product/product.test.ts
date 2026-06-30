import { describe, expect, it, mock } from 'bun:test'

const mock_db = {
  insert: mock(() => ({
    values: mock(() => ({
      returning: mock(() =>
        Promise.resolve([
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
          },
        ]),
      ),
    })),
  })),
  select: mock(() => ({
    from: mock(() => ({
      where: mock(() => ({
        limit: mock(() => Promise.resolve([])),
      })),
    })),
  })),
  update: mock(() => ({
    set: mock(() => ({
      where: mock(() => ({
        returning: mock(() =>
          Promise.resolve([
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
            },
          ]),
        ),
      })),
      returning: mock(() =>
        Promise.resolve([
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
          },
        ]),
      ),
    })),
  })),
}

const mock_redis = {
  get: mock(() => Promise.resolve(null)),
  set: mock(() => Promise.resolve('OK')),
  del: mock(() => Promise.resolve(1)),
}

mock.module('@db/client.db', () => ({
  db_client: mock(() => mock_db),
  db_redis_auth: mock_redis,
  db_redis_tenant_access: mock_redis,
  db_redis_migration_lock: mock_redis,
  db_redis_rate_limiting: mock_redis,
  get_tenant_type: (tenant_id: number, payload: any) => payload?.tenants?.find((t: any) => t.tenant_id === tenant_id)?.tenant_type || 'organization',
  get_tenant_url: () => 'mock-tenant-url',
  close_all_connections: () => {},
}))

mock.module('@db/utils.db', () => ({
  select: mock(() =>
    Promise.resolve({
      rows: null,
      pages: null,
      page: 1,
      take: 12,
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
        },
      ],
    }),
  ),
  sync_schema: mock(() => Promise.resolve()),
}))

const { service_product } = await import('@module/main/product/product.service')

describe('Product Service', () => {
  it('should find products successfully', async () => {
    const result = await service_product.find({
      columns: ['product_id', 'product_barcode'],
      product_id: [1],
      take: 12,
    })

    expect(result.data).toBeDefined()
    expect(result.data[0]?.product_id).toBe(1)
  })

  it('should create a product successfully', async () => {
    mock_db.select = mock(() => ({
      from: mock(() => ({
        where: mock(() => ({
          limit: mock(() => Promise.resolve([])),
        })),
      })),
    }))

    mock_db.insert = mock(() => ({
      values: mock(() => ({
        returning: mock(() =>
          Promise.resolve([
            {
              product_id: 2,
              product_barcode: '0987654321',
              product_type: 'food',
              product_name: 'new-product',
              brand_id: null,
              product_nova_group: null,
              product_ecoscore: null,
              product_nutriscore: null,
              product_metadata: null,
            },
          ]),
        ),
      })),
    }))

    const result = await service_product.create({
      product_barcode: '0987654321',
      product_type: 'food',
      product_name: 'new-product',
    })

    expect(result.data).toBeDefined()
    expect(result.data.product_id).toBe(2)
  })

  it('should update a product successfully', async () => {
    const result = await service_product.update({
      product_id: 1,
      product_name: 'updated-product',
    })

    expect(result.data).toBeDefined()
    expect(result.data.product_id).toBe(1)
  })

  it('should delete a product successfully', async () => {
    const result = await service_product.delete({
      product_id: 1,
    })

    expect(result.data).toBeDefined()
    expect(result.data.product_id).toBe(1)
  })
})
