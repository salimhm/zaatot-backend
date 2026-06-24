import { describe, expect, it, mock } from 'bun:test'

const mock_db = {
  insert: mock(() => ({
    values: mock(() => ({
      returning: mock(() => Promise.resolve([{ user_id: 1, user_phone: '1234567890' }])),
    })),
  })),
  select: mock(
    (..._args: any[]) =>
      ({
        from: mock((..._args: any[]) => ({
          where: mock((..._args: any[]) => ({
            limit: mock(() => Promise.resolve([{ user_id: 1, user_phone: '1234567890' }])),
          })),
          innerJoin: mock((..._args: any[]) => ({
            where: mock(() => Promise.resolve([])),
          })),
        })),
      }) as any,
  ),
}

const mock_redis = {
  set: mock(() => Promise.resolve('OK')),
  get: mock(() => Promise.resolve(null)),
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

mock.module('@db/utils.db', () => ({
  select: mock(() =>
    Promise.resolve({
      rows: null,
      pages: null,
      page: 1,
      take: 12,
      data: [{ user_id: 1, user_phone: '1234567890' }],
    }),
  ),
  sync_schema: mock(() => Promise.resolve()),
}))

const { service_auth } = await import('@module/main/auth/auth.service')

describe('Auth Service', () => {
  it('should sign in a user and return a token', async () => {
    const mock_jwt = {
      sign: mock(() => Promise.resolve('mock_token')),
    }
    const mock_user = {
      user_id: 1,
      user_phone: '+1234567890',
      user_first_name: 'John',
      user_last_name: 'Doe',
      user_image: null,
      created_at: new Date().toISOString(),
    }

    const result = await service_auth.sign_in({
      user: mock_user,
      jwt: mock_jwt,
    })

    expect(result.token).toBe('mock_token')
    expect(result.data.user_id).toBe(1)
  })

  it('should generate an OTP response successfully', async () => {
    const body = {
      user_phone: '1234567890',
      otp_action: 'sign_in' as const,
    }

    const result = await service_auth.send_otp(body)

    expect(result.success).toBe(true)
  })
})
