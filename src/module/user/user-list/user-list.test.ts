import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

import { service_product } from '@module/main/product/product.service'
import { service_access } from '@module/tenant/access/access.service'

const mock_db = {
  insert: mock(() => ({
    values: mock(() => ({
      returning: mock(() => Promise.resolve([{ user_list_id: 1, product_id: 1, user_list_type: 'whitelist' }])),
    })),
  })),
  update: mock(() => ({
    set: mock(() => ({
      where: mock(() => ({
        returning: mock(() => Promise.resolve([{ user_list_id: 1, product_id: 1, user_list_type: 'whitelist' }])),
      })),
      returning: mock(() => Promise.resolve([{ user_list_id: 1, product_id: 1, user_list_type: 'whitelist' }])),
    })),
  })),
}

const mock_redis = {
  get: mock(() => Promise.resolve(null)),
  set: mock(() => Promise.resolve('OK')),
  del: mock(() => Promise.resolve(1)),
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
      data: [{ user_list_id: 1, product_id: 1, user_list_type: 'whitelist' }],
    }),
  ),
  sync_schema: mock(() => Promise.resolve()),
}))

beforeEach(() => {
  spyOn(service_access, 'check_access').mockImplementation(() => Promise.resolve())
  spyOn(service_product, 'find').mockImplementation(() =>
    Promise.resolve({
      rows: null,
      pages: null,
      page: 1,
      take: 12,
      data: [{ product_id: 1, product_barcode: '1234567890', product_name: 'test-product', product_type: 'food' } as any],
    }),
  )
})

afterEach(() => {
  mock.restore()
})

const { service_user_list } = await import('@module/user/user-list/user-list.service')

describe('User List Service', () => {
  it('should find user list items successfully', async () => {
    spyOn(service_user_list, 'find').mockImplementation(() =>
      Promise.resolve({
        rows: null,
        pages: null,
        page: 1,
        take: 12,
        data: [
          {
            user_list_id: 1,
            product_id: 1,
            user_list_type: 'whitelist',
            product: { product_id: 1, product_barcode: '1234567890', product_name: 'test-product', product_type: 'food' } as any,
          },
        ],
      }),
    )

    const result = await service_user_list.find(
      {
        columns: ['user_list_id', 'product_id', 'user_list_type'],
        take: 12,
      },
      { user_id: 1 },
    )

    expect(result.data).toBeDefined()
    expect(result.data[0]?.user_list_id).toBe(1)
    expect(result.data[0]?.product).toBeDefined()
  })

  it('should create a user list item successfully', async () => {
    spyOn(service_user_list, 'find').mockImplementation(() => Promise.reject({ status: 404, code: 'not-found-user-list' }))

    const result = await service_user_list.create(
      {
        product_id: 1,
        user_list_type: 'whitelist',
      },
      { user_id: 1 },
    )

    expect(result.data).toBeDefined()
    expect(result.data.user_list_id).toBe(1)
  })

  it('should update a user list item successfully', async () => {
    spyOn(service_user_list, 'find').mockImplementation(() =>
      Promise.resolve({
        rows: null,
        pages: null,
        page: 1,
        take: 12,
        data: [{ user_list_id: 1, product_id: 1, user_list_type: 'whitelist' }],
      }),
    )

    const result = await service_user_list.update(
      {
        product_id: 1,
        user_list_type: 'blacklist',
      },
      { user_id: 1 },
    )

    expect(result.data).toBeDefined()
    expect(result.data.product_id).toBe(1)
  })

  it('should delete a user list item successfully', async () => {
    spyOn(service_user_list, 'find').mockImplementation(() =>
      Promise.resolve({
        rows: null,
        pages: null,
        page: 1,
        take: 12,
        data: [{ user_list_id: 1, product_id: 1, user_list_type: 'whitelist' }],
      }),
    )

    const result = await service_user_list.delete(
      {
        product_id: 1,
      },
      { user_id: 1 },
    )

    expect(result.data).toBeDefined()
    expect(result.data.product_id).toBe(1)
  })
})
