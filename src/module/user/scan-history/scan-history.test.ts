import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

import { service_product } from '@module/main/product/product.service'
import { service_access } from '@module/tenant/access/access.service'

const mock_db = {
  insert: mock(() => ({
    values: mock(() => ({
      returning: mock(() =>
        Promise.resolve([{ scan_history_id: 1, product_id: 1, product_barcode: '1234567890', scanned_at: '2026-06-20T19:00:00Z' }]),
      ),
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

mock.module('@db/utils.db', () => ({
  select: mock(() =>
    Promise.resolve({
      rows: null,
      pages: null,
      page: 1,
      take: 12,
      data: [{ scan_history_id: 1, product_id: 1, product_barcode: '1234567890', scanned_at: '2026-06-20T19:00:00Z' }],
    }),
  ),
  sync_schema: mock(() => Promise.resolve()),
}))

afterEach(() => {
  mock.restore()
})

const { service_scan_history } = await import('@module/user/scan-history/scan-history.service')

describe('Scan History Service', () => {
  it('should find scan history successfully', async () => {
    const result = await service_scan_history.find(
      {
        columns: ['scan_history_id', 'product_id'],
        take: 12,
      },
      { user_id: 1 },
    )

    expect(result.data).toBeDefined()
    expect(result.data[0]?.scan_history_id).toBe(1)
    expect(result.data[0]?.product).toBeDefined()
  })

  it('should create a scan history record successfully', async () => {
    const result = await service_scan_history.create(
      {
        product_id: 1,
        product_barcode: '1234567890',
      },
      { user_id: 1 },
    )

    expect(result).toBeDefined()
    expect(result.scan_history_id).toBe(1)
  })
})
