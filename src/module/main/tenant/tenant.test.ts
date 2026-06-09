import { describe, expect, it, mock } from 'bun:test'

const mock_db = {
  insert: mock(() => ({
    values: mock(() => ({
      returning: mock(() => Promise.resolve([{ organization_id: 1, organization_name: 'Acme', user_id: 1 }])),
    })),
  })),
  select: mock(
    (..._args: any[]) =>
      ({
        from: mock((..._args: any[]) => ({
          where: mock((..._args: any[]) => Promise.resolve([{ count: 0, schema_version: '0.0.0', db_url: 'db-url' }]) as Promise<any>),
          innerJoin: mock((..._args: any[]) => ({
            where: mock((..._args: any[]) => Promise.resolve([{ organization_id: 1, organization_schema_version: '0.0.1' }]) as Promise<any>),
          })),
        })),
      }) as any,
  ),
  update: mock(() => ({
    set: mock(() => ({
      where: mock(() => ({
        returning: mock(() => Promise.resolve([{ organization_id: 1, organization_name: 'Acme', user_id: 1 }])),
      })),
      returning: mock(() => Promise.resolve([{ organization_id: 1, organization_name: 'Acme', user_id: 1 }])),
    })),
  })),
  delete: mock(() => ({
    where: mock(() => Promise.resolve()),
  })),
}

const mock_redis = {
  get: mock(() => Promise.resolve(null)),
  set: mock(() => Promise.resolve('OK')),
  del: mock(() => Promise.resolve(1)),
}

const mock_turso_create = mock(() => Promise.resolve({ id: 'db-id', hostname: 'db-url' }))

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

mock.module('@db/main.schema.db', () => ({
  current_schema_version: {
    user: '0.0.6',
    organization: '0.0.1',
  },
  table_organization: {
    organization_id: 'organization_id',
    organization_schema_version: 'organization_schema_version',
    organization_db_url: 'organization_db_url',
  },
  table_user: {
    user_id: 'user_id',
    user_schema_version: 'user_schema_version',
    user_db_url: 'user_db_url',
  },
}))

mock.module('@db/utils.db', () => ({
  select: mock(() =>
    Promise.resolve({
      rows: null,
      pages: null,
      page: 1,
      take: 12,
      data: [{ organization_id: 1, organization_name: 'Acme', user_id: 1 }],
    }),
  ),
  sync_schema: mock(() => Promise.resolve()),
}))

mock.module('@tursodatabase/api', () => ({
  createClient: mock(() => ({
    databases: {
      create: mock_turso_create,
    },
  })),
}))

mock.module('@module/tenant/access/access.service', () => ({
  service_access: {
    create_access_for_owner: mock(() => Promise.resolve()),
  },
}))

const { service_tenant } = await import('@module/main/tenant/tenant.service')

describe('Tenant Service', () => {
  it('should run provision_tenant_db successfully for user', async () => {
    await service_tenant.provision_tenant_db({ tenant_id: 1, user_id: 1, tenant_type: 'user' })
    expect(mock_turso_create).toHaveBeenCalled()
  })

  it('should run provision_tenant_db successfully for organization', async () => {
    await service_tenant.provision_tenant_db({ tenant_id: 1, user_id: 1, tenant_type: 'organization' })
    expect(mock_turso_create).toHaveBeenCalled()
  })

  it('should run migrate_schema successfully for user', async () => {
    const migrated = await service_tenant.migrate_schema({ tenant_id: 1, tenant_type: 'user' })
    expect(migrated).toBe(true)
  })

  it('should run migrate_schema successfully for organization', async () => {
    const migrated = await service_tenant.migrate_schema({ tenant_id: 1, tenant_type: 'organization' })
    expect(migrated).toBe(true)
  })

  it('should skip migration when schema version is already current', async () => {
    mock_db.select.mockImplementationOnce(() => ({
      from: mock(() => ({
        where: mock(() => Promise.resolve([{ schema_version: '0.0.6', db_url: 'db-url' }])),
      })),
    }))

    const migrated = await service_tenant.migrate_schema({ tenant_id: 1, tenant_type: 'user' })
    expect(migrated).toBe(true)
  })

  it('should throw user_not_ready if db_url is null', async () => {
    mock_db.select.mockImplementationOnce(() => ({
      from: mock(() => ({
        where: mock(() => Promise.resolve([{ schema_version: '0.0.0', db_url: null }])),
      })),
    }))

    try {
      await service_tenant.migrate_schema({ tenant_id: 1, tenant_type: 'user' })
      expect(true).toBe(false)
    } catch (error: unknown) {
      const err = error as { code?: string }
      expect(err.code).toBe('user-not-ready')
    }
  })

  it('should throw user_not_ready if migration lock is already held', async () => {
    mock_redis.set.mockImplementationOnce(() => Promise.resolve(null as unknown as string))

    try {
      await service_tenant.migrate_schema({ tenant_id: 1, tenant_type: 'user' })
      expect(true).toBe(false)
    } catch (error: unknown) {
      const err = error as { code?: string }
      expect(err.code).toBe('user-not-ready')
    }
  })
})
