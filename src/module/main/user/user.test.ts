import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

const mock_db = {
  insert: mock(() => ({
    values: mock(() => ({
      returning: mock(() => Promise.resolve([{ user_id: 1, user_phone: '+1234567890', user_first_name: 'John', user_last_name: 'Doe' }])),
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
        returning: mock(() => Promise.resolve([{ user_id: 1, user_phone: '+1234567890', user_first_name: 'John', user_last_name: 'Doe' }])),
      })),
      returning: mock(() => Promise.resolve([{ user_id: 1, user_phone: '+1234567890', user_first_name: 'John', user_last_name: 'Doe' }])),
    })),
  })),
}

const mock_redis = {
  get: mock(() => Promise.resolve(null)),
  set: mock(() => Promise.resolve('OK')),
  del: mock(() => Promise.resolve(1)),
  incr: mock(() => Promise.resolve(1)),
  expire: mock(() => Promise.resolve(1)),
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

const { service_tenant } = await import('@module/main/tenant/tenant.service')
const { service_user } = await import('@module/main/user/user.service')

let spy_provision: any
beforeEach(() => {
  spy_provision = spyOn(service_tenant, 'provision_tenant_db').mockImplementation(() => Promise.resolve())
})

afterEach(() => {
  spy_provision.mockRestore()
})

mock.module('@db/utils.db', () => ({
  select: mock(() =>
    Promise.resolve({
      rows: null,
      pages: null,
      page: 1,
      take: 12,
      data: [{ user_id: 1, user_phone: '+1234567890', user_first_name: 'John', user_last_name: 'Doe' }],
    }),
  ),
  sync_schema: mock(() => Promise.resolve()),
}))

describe('User Service', () => {
  it('should find users successfully', async () => {
    const result = await service_user.find({
      columns: ['user_id', 'user_phone'],
      user_id: ['1'],
      take: 12,
    })

    expect(result.data).toBeDefined()
    expect(result.data[0]?.user_id).toBe(1)
  })

  it('should create a user successfully', async () => {
    const body = {
      user_phone: '+1234567890',
      user_first_name: 'John',
      user_last_name: 'Doe',
    }

    const result = await service_user.create(body)

    expect(result.data).toBeDefined()
    expect(result.data.user_phone).toBe('+1234567890')
    expect(spy_provision).toHaveBeenCalled()
  })

  it('should update a user successfully', async () => {
    const body = {
      user_first_name: 'Jane',
    }
    const payload = {
      user_id: 1,
    }

    const result = await service_user.update(body, payload)

    expect(result.data).toBeDefined()
    expect(result.data.user_id).toBe(1)
  })
})
