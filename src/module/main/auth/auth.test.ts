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

mock.module('@db/client.db', () => ({
  db_client: mock(() => mock_db),
  db_redis_auth: {
    set: mock(() => Promise.resolve('OK')),
    get: mock(() => Promise.resolve(null)),
    del: mock(() => Promise.resolve(1)),
    incr: mock(() => Promise.resolve(1)),
    expire: mock(() => Promise.resolve(1)),
  },
}))

mock.module('@db/main.schema.db', () => ({
  current_schema_version: {
    user: '0.0.1',
    organization: '0.0.1',
  },
  table_user: {},
  table_organization: {},
  table_organization_user: {},
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
