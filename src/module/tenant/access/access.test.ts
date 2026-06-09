import { describe, expect, it, mock } from 'bun:test'

import { service_access } from '@module/tenant/access/access.service'

const mock_db = {
  insert: mock(() => ({
    values: mock(() => ({
      returning: mock(() => Promise.resolve([{ access_id: 1, user_id: 1, actions: ['full_access'] }])),
    })),
  })),
  select: mock(() => ({
    from: mock(() => ({
      where: mock(() => ({
        limit: mock(() => Promise.resolve([{ actions: ['owner'] }])),
      })),
    })),
  })),
  update: mock(() => ({
    set: mock(() => ({
      where: mock(() => ({
        returning: mock(() => Promise.resolve([{ access_id: 1, user_id: 1, actions: ['full_access'] }])),
      })),
      returning: mock(() => Promise.resolve([{ access_id: 1, user_id: 1, actions: ['full_access'] }])),
    })),
  })),
}

const mock_redis = {
  get: mock(() => Promise.resolve(null as string | null)),
  set: mock(() => Promise.resolve('OK')),
  del: mock(() => Promise.resolve(1)),
}

mock.module('@db/client.db', () => ({
  db_client: mock(() => mock_db),
  db_redis_tenant_access: mock_redis,
}))

mock.module('@db/utils.db', () => ({
  select: mock(() =>
    Promise.resolve({
      rows: null,
      pages: null,
      page: 1,
      take: 12,
      data: [{ access_id: 1, user_id: 1, actions: ['owner'] }],
    }),
  ),
}))

describe('Access Service', () => {
  it('should find access permissions successfully', async () => {
    const result = await service_access.find(
      {
        columns: ['access_id', 'actions'],
        tenant_id: 1,
        user_id: [1],
        take: 12,
      },
      { user_id: 1 },
    )

    expect(result.data).toBeDefined()
    expect(result.data[0]?.access_id).toBe(1)
  })

  it('should create access permissions successfully', async () => {
    const body = {
      tenant_id: 1,
      user_id: 2,
      actions: ['full_access' as const],
    }
    const payload = {
      user_id: 1,
    }

    const result = await service_access.create(body, payload)

    expect(result.data).toBeDefined()
    expect(result.data.actions).toContain('full_access')
  })

  it('should update access permissions successfully', async () => {
    const body = {
      tenant_id: 1,
      user_id: 2,
      actions: ['full_access' as const],
    }
    const payload = {
      user_id: 1,
    }

    const result = await service_access.update(body, payload)

    expect(result.data).toBeDefined()
    expect(result.data.actions).toContain('full_access')
  })

  it('should delete access permissions successfully', async () => {
    const body = {
      tenant_id: 1,
      user_id: 2,
    }
    const payload = {
      user_id: 1,
    }

    const result = await service_access.delete(body, payload)

    expect(result.data).toBeDefined()
  })

  it('should check access successfully when user is owner', async () => {
    await service_access.check_access({ tenant_id: 1 }, { user_id: 1 })
  })

  it('should throw unauthorized when user has no access record', async () => {
    mock_db.select.mockImplementationOnce(() => ({
      from: mock(() => ({
        where: mock(() => ({
          limit: mock(() => Promise.resolve([])),
        })),
      })),
    }))

    try {
      await service_access.check_access({ tenant_id: 1 }, { user_id: 99 })
      expect(true).toBe(false)
    } catch (error: unknown) {
      const err = error as { code?: string }
      expect(err.code).toBe('unauthorized')
    }
  })

  it('should throw unauthorized when user has empty actions array', async () => {
    mock_db.select.mockImplementationOnce(() => ({
      from: mock(() => ({
        where: mock(() => ({
          limit: mock(() => Promise.resolve([{ actions: [] }])),
        })),
      })),
    }))

    try {
      await service_access.check_access({ tenant_id: 1 }, { user_id: 99 })
      expect(true).toBe(false)
    } catch (error: unknown) {
      const err = error as { code?: string }
      expect(err.code).toBe('unauthorized')
    }
  })

  it('should throw unauthorized when user has full_access but owner is required', async () => {
    mock_db.select.mockImplementationOnce(() => ({
      from: mock(() => ({
        where: mock(() => ({
          limit: mock(() => Promise.resolve([{ actions: ['full_access'] }])),
        })),
      })),
    }))

    try {
      await service_access.check_access({ tenant_id: 1, required_access: ['owner'] }, { user_id: 2 })
      expect(true).toBe(false)
    } catch (error: unknown) {
      const err = error as { code?: string }
      expect(err.code).toBe('unauthorized')
    }
  })

  it('should allow full_access user when owner is not required', async () => {
    mock_db.select.mockImplementationOnce(() => ({
      from: mock(() => ({
        where: mock(() => ({
          limit: mock(() => Promise.resolve([{ actions: ['full_access'] }])),
        })),
      })),
    }))

    await service_access.check_access({ tenant_id: 1, required_access: ['full_access'] }, { user_id: 2 })
  })

  it('should get access actions from redis if cached', async () => {
    mock_redis.get.mockImplementationOnce(() => Promise.resolve(JSON.stringify(['owner'])))
    await service_access.check_access({ tenant_id: 1 }, { user_id: 3 })
    expect(mock_redis.get).toHaveBeenCalledWith('tenant_access:organization:1:3')
  })

  it('should delete redis cache key when updating access', async () => {
    const body = {
      tenant_id: 1,
      user_id: 2,
      actions: ['full_access' as const],
    }
    const payload = {
      user_id: 1,
    }
    await service_access.update(body, payload)
    expect(mock_redis.del).toHaveBeenCalledWith('tenant_access:organization:1:2')
  })
})
