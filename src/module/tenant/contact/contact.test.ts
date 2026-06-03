import { describe, expect, it, mock } from 'bun:test'

const mock_db = {
  insert: mock(() => ({
    values: mock(() => ({
      returning: mock(() => Promise.resolve([{ contact_id: 1, contact_phone: '+1234567890', contact_name: 'Contact One' }])),
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
        returning: mock(() => Promise.resolve([{ contact_id: 1, contact_phone: '+1234567890', contact_name: 'Contact One' }])),
      })),
      returning: mock(() => Promise.resolve([{ contact_id: 1, contact_phone: '+1234567890', contact_name: 'Contact One' }])),
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
  db_redis_main: mock_redis,
}))

import { service_contact } from '@module/tenant/contact/contact.service'

let should_find_exist = false

mock.module('@db/utils.db', () => ({
  select: mock(() => {
    if (should_find_exist) {
      return Promise.resolve({
        rows: 1,
        pages: 1,
        page: 1,
        take: 12,
        data: [{ contact_id: 1, contact_phone: '+1234567890', contact_name: 'Contact One' }],
      })
    }
    class NotFoundError extends Error {
      code = 'not-found-contact'
    }
    const err = new NotFoundError('Not found contact')
    return Promise.reject(err)
  }),
}))

describe('Contact Service', () => {
  it('should find contacts successfully when contact exists', async () => {
    should_find_exist = true
    const result = await service_contact.find(
      {
        columns: ['contact_id', 'contact_name'],
        tenant_id: 1,
        take: 12,
      },
      { user_id: 1 },
    )

    expect(result.data).toBeDefined()
    expect(result.data[0]?.contact_id).toBe(1)
  })

  it('should create a contact successfully when contact does not exist', async () => {
    should_find_exist = false
    const body = {
      tenant_id: 1,
      contact_phone: '+1234567890',
      contact_name: 'Contact One',
    }
    const payload = {
      user_id: 1,
    }

    const result = await service_contact.create(body, payload)

    expect(result.data).toBeDefined()
    expect(result.data.contact_phone).toBe('+1234567890')
  })

  it('should update a contact successfully', async () => {
    should_find_exist = true
    const body = {
      tenant_id: 1,
      contact_id: 1,
      contact_name: 'Contact Updated',
    }
    const payload = {
      user_id: 1,
    }

    const result = await service_contact.update(body, payload)

    expect(result.data).toBeDefined()
    expect(result.data.contact_name).toBe('Contact One')
  })

  it('should delete a contact successfully', async () => {
    should_find_exist = true
    const body = {
      tenant_id: 1,
      contact_id: 1,
    }
    const payload = {
      user_id: 1,
    }

    const result = await service_contact.delete(body, payload)

    expect(result.data).toBeDefined()
  })
})
