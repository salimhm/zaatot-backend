import { describe, expect, it, mock } from 'bun:test'

import { service_tenant } from '@module/main/tenant/tenant.service'

const mock_db = {
  insert: mock(() => ({
    values: mock(() => ({
      returning: mock(() => Promise.resolve([{ tenant_id: 1, tenant_name: 'Acme', tenant_type: 'user', user_id: 1 }])),
    })),
  })),
  select: mock(() => ({
    from: mock(() => ({
      where: mock(() => Promise.resolve([{ count: 0, tenant_schema_version: '0.0.0', tenant_type: 'user', tenant_db_id: 'db-id' as string | null }])),
    })),
  })),
  update: mock(() => ({
    set: mock(() => ({
      where: mock(() => ({
        returning: mock(() => Promise.resolve([{ tenant_id: 1, tenant_name: 'Acme', tenant_type: 'user', user_id: 1 }])),
      })),
      returning: mock(() => Promise.resolve([{ tenant_id: 1, tenant_name: 'Acme', tenant_type: 'user', user_id: 1 }])),
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
  db_redis_main: mock_redis,
  current_tenant_schema_version: '0.0.5',
}))

mock.module('@db/utils.db', () => ({
  select: mock(() =>
    Promise.resolve({
      rows: null,
      pages: null,
      page: 1,
      take: 12,
      data: [{ tenant_id: 1, tenant_name: 'Acme', tenant_type: 'user', user_id: 1 }],
    }),
  ),
  sync_schema: mock(() => Promise.resolve()),
}))

mock.module('@tursodatabase/api', () => ({
  createClient: mock(() => ({
    databases: {
      create: mock(() => Promise.resolve({ id: 'db-id', hostname: 'db-url' })),
    },
  })),
}))

describe('Tenant Service', () => {
  it('should find tenants successfully', async () => {
    const result = await service_tenant.find(
      {
        columns: ['tenant_id', 'tenant_name'],
        take: 12,
      },
      { user_id: 1 },
    )

    expect(result.data).toBeDefined()
    expect(result.data[0]?.tenant_id).toBe(1)
  })

  it('should create a tenant successfully', async () => {
    const body = {
      tenant_name: 'Acme',
      tenant_type: 'user' as const,
    }
    const payload = {
      user_id: 1,
    }

    const result = await service_tenant.create(body, payload)

    expect(result.data).toBeDefined()
    expect(result.data.tenant_name).toBe('Acme')
  })

  it('should throw user-max-tenants when limit is reached', async () => {
    mock_db.select.mockImplementationOnce(() => ({
      from: mock(() => ({
        where: mock(() => Promise.resolve([{ count: 12, tenant_schema_version: '0.0.0', tenant_type: 'user', tenant_db_id: 'db-id' }])),
      })),
    }))

    try {
      await service_tenant.create({ tenant_name: 'Over Limit', tenant_type: 'user' as const }, { user_id: 1 })
      expect(true).toBe(false)
    } catch (error: unknown) {
      const err = error as { code?: string }
      expect(err.code).toBe('user-max-tenants')
    }
  })

  it('should update a tenant successfully', async () => {
    const body = {
      tenant_id: 1,
      tenant_name: 'Acme Updated',
    }
    const payload = {
      user_id: 1,
    }

    const result = await service_tenant.update(body, payload)

    expect(result.data).toBeDefined()
    expect(result.data.tenant_name).toBe('Acme')
  })

  it('should delete a tenant successfully', async () => {
    const body = {
      tenant_id: 1,
    }
    const payload = {
      user_id: 1,
    }

    const result = await service_tenant.delete(body, payload)

    expect(result.data).toBeDefined()
    expect(result.data.tenant_id).toBe(1)
  })

  it('should run migrate_schema successfully', async () => {
    await service_tenant.migrate_schema(1)
  })

  it('should throw tenant-not-ready if tenant_db_id is null', async () => {
    mock_db.select.mockImplementationOnce(() => ({
      from: mock(() => ({
        where: mock(() => Promise.resolve([{ count: 0, tenant_schema_version: '0.0.0', tenant_type: 'user', tenant_db_id: null }])),
      })),
    }))

    try {
      await service_tenant.migrate_schema(1)
      expect(true).toBe(false)
    } catch (error: unknown) {
      const err = error as { code?: string }
      expect(err.code).toBe('tenant-not-ready')
    }
  })

  it('should throw tenant-not-ready if migration lock is already held', async () => {
    mock_redis.set.mockImplementationOnce(() => Promise.resolve(null as unknown as string))

    try {
      await service_tenant.migrate_schema(1)
      expect(true).toBe(false)
    } catch (error: unknown) {
      const err = error as { code?: string }
      expect(err.code).toBe('tenant-not-ready')
    }
  })
})
