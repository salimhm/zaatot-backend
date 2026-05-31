import { describe, expect, it, mock } from 'bun:test'

import { service_user } from '@module/main/user/user.service'

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

mock.module('@db/client.db', () => ({
  db_client: mock(() => mock_db),
}))

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
