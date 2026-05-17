import { describe, expect, it, mock } from 'bun:test'

import { service_auth } from '@module/main/auth/auth.service'

mock.module('@module/main/user/user.service', () => ({
  service_user: {
    find: mock(() => Promise.resolve({ data: [{ user_id: 1 }] })),
    create: mock(() => Promise.resolve({ data: { user_id: 1, user_phone: '1234567890' } })),
  },
}))

mock.module('@db/client.db', () => ({
  db_client: mock(() =>
    Promise.resolve({
      insert: () => ({ values: () => Promise.resolve() }),
      select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => Promise.resolve([]) }) }) }) }),
      delete: () => ({ where: () => Promise.resolve() }),
    }),
  ),
  db_redis_main: {
    set: mock(() => Promise.resolve('OK')),
    get: mock(() => Promise.resolve(null)),
    del: mock(() => Promise.resolve(1)),
    incr: mock(() => Promise.resolve(1)),
    expire: mock(() => Promise.resolve(1)),
  },
}))

describe('Auth Service', () => {
  it('should sign in a user and return a token', async () => {
    const mock_jwt = {
      sign: mock(() => Promise.resolve('mock_token')),
    }
    const mock_user = { user_id: 1, user_phone: '1234567890' }

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
