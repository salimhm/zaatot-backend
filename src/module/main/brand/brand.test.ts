import { describe, expect, it, mock } from 'bun:test'

const mock_db = {
  insert: mock(() => ({
    values: mock(() => ({
      returning: mock(() =>
        Promise.resolve([
          { brand_id: 1, brand_name: 'test-brand', brand_is_boycotted: false, brand_boycott_reasons: [], brand_boycott_alternatives: [] },
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
            { brand_id: 1, brand_name: 'test-brand', brand_is_boycotted: false, brand_boycott_reasons: [], brand_boycott_alternatives: [] },
          ]),
        ),
      })),
      returning: mock(() =>
        Promise.resolve([
          { brand_id: 1, brand_name: 'test-brand', brand_is_boycotted: false, brand_boycott_reasons: [], brand_boycott_alternatives: [] },
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
      data: [{ brand_id: 1, brand_name: 'test-brand', brand_is_boycotted: false, brand_boycott_reasons: [], brand_boycott_alternatives: [] }],
    }),
  ),
  sync_schema: mock(() => Promise.resolve()),
}))

const { service_brand } = await import('@module/main/brand/brand.service')

describe('Brand Service', () => {
  it('should find brands successfully', async () => {
    const result = await service_brand.find({
      columns: ['brand_id', 'brand_name'],
      brand_id: [1],
      take: 12,
    })

    expect(result.data).toBeDefined()
    expect(result.data[0]?.brand_id).toBe(1)
  })

  it('should find_or_create_by_name when brand exists', async () => {
    mock_db.select = mock(() => ({
      from: mock(() => ({
        where: mock(() => ({
          limit: mock(() =>
            Promise.resolve([
              { brand_id: 1, brand_name: 'test-brand', brand_is_boycotted: false, brand_boycott_reasons: [], brand_boycott_alternatives: [] },
            ]),
          ),
        })),
      })),
    }))

    const result = await service_brand.find_or_create_by_name('test-brand')

    expect(result).toBeDefined()
    expect(result.brand_id).toBe(1)
  })

  it('should find_or_create_by_name when brand does not exist', async () => {
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
            { brand_id: 2, brand_name: 'new-brand', brand_is_boycotted: false, brand_boycott_reasons: [], brand_boycott_alternatives: [] },
          ]),
        ),
      })),
    }))

    const result = await service_brand.find_or_create_by_name('new-brand')

    expect(result).toBeDefined()
    expect(result.brand_id).toBe(2)
  })

  it('should create a brand successfully', async () => {
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
            { brand_id: 3, brand_name: 'created-brand', brand_is_boycotted: false, brand_boycott_reasons: [], brand_boycott_alternatives: [] },
          ]),
        ),
      })),
    }))

    const result = await service_brand.create({
      brand_name: 'created-brand',
    })

    expect(result.data).toBeDefined()
    expect(result.data.brand_id).toBe(3)
  })

  it('should update a brand successfully', async () => {
    const result = await service_brand.update({
      brand_id: 1,
      brand_is_boycotted: true,
    })

    expect(result.data).toBeDefined()
    expect(result.data.brand_id).toBe(1)
  })

  it('should delete a brand successfully', async () => {
    const result = await service_brand.delete({
      brand_id: 1,
    })

    expect(result.data).toBeDefined()
    expect(result.data.brand_id).toBe(1)
  })
})
