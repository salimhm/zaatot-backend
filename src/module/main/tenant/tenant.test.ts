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
      where: mock(() => Promise.resolve([{ count: 0, tenant_schema_version: '0.0.0', tenant_type: 'user' }])),
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

mock.module('@db/client.db', () => ({
  db_client: mock(() => Promise.resolve(mock_db)),
  db_redis_main: {
    get: mock(() => Promise.resolve(null)),
    set: mock(() => Promise.resolve('OK')),
  },
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
})
