import { describe, expect, it, mock } from 'bun:test'

import { service_file } from '@module/tenant/file/file.service'

const mock_db = {
  insert: mock(() => ({
    values: mock(() => ({
      returning: mock(() => Promise.resolve([{ file_id: 'user-1/file.jpg', file_name: 'file.jpg', user_id: 1 }])),
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
        returning: mock(() => Promise.resolve([{ file_id: 'user-1/file.jpg', file_name: 'file_new.jpg', user_id: 1 }])),
      })),
      returning: mock(() => Promise.resolve([{ file_id: 'user-1/file.jpg', file_name: 'file_new.jpg', user_id: 1 }])),
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
      data: [{ file_id: 'user-1/file.jpg', file_name: 'file.jpg', user_id: 1 }],
    }),
  ),
}))

mock.module('@lib/middleware.lib', () => ({
  check_rate_limit: mock(() => Promise.resolve()),
}))

mock.module('@storage/client.storage', () => ({
  storage_object_main: {
    send: mock(() => Promise.resolve()),
  },
}))

mock.module('@aws-sdk/client-s3', () => ({
  PutObjectCommand: class {},
}))

mock.module('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mock(() => Promise.resolve('https://mock-presigned-url.com/file.jpg')),
}))

describe('File Service', () => {
  it('should find files successfully', async () => {
    const result = await service_file.find(
      {
        columns: ['file_id', 'file_name'],
        tenant_id: 1,
        take: 12,
      },
      { user_id: 1 },
    )

    expect(result.data).toBeDefined()
    expect(result.data[0]?.file_id).toBe('user-1/file.jpg')
  })

  it('should create a file successfully', async () => {
    const body = {
      tenant_id: 1,
      file_name: 'file.jpg',
      file_type: 'image/jpeg',
      file_size: 1024,
    }
    const payload = {
      user_id: 1,
    }

    const result = await service_file.create(body, payload)

    expect(result.upload_url).toBe('https://mock-presigned-url.com/file.jpg')
    expect(result.data).toBeDefined()
    expect(result.data.file_id).toBeDefined()
    expect(result.data.user_id).toBe(1)
  })

  it('should update a file successfully', async () => {
    const body = {
      tenant_id: 1,
      file_id: 'user-1/file.jpg',
      file_name: 'file_new.jpg',
    }
    const payload = {
      user_id: 1,
    }

    const result = await service_file.update(body, payload)

    expect(result.data).toBeDefined()
    expect(result.data.file_name).toBe('file_new.jpg')
  })

  it('should delete a file successfully', async () => {
    const body = {
      tenant_id: 1,
      file_id: 'user-1/file.jpg',
    }
    const payload = {
      user_id: 1,
    }

    const result = await service_file.delete(body, payload)

    expect(result.data).toBeDefined()
    expect(result.data.file_id).toBe('user-1/file.jpg')
  })
})
