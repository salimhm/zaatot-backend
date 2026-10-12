import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'

import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

import { drizzle } from 'drizzle-orm/libsql'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { table_scan_history } from '@db/user.schema.db'

import { service_product } from '@module/main/product/product.service'
import { service_access } from '@module/tenant/access/access.service'
import { query_scan_history_window, service_scan_history } from '@module/user/scan-history/scan-history.service'

// Mirrors table_scan_history; the first test fails if the schema gains or loses a column.
const create_table = `
  CREATE TABLE scan_history (
    scan_history_id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    product_id integer NOT NULL,
    product_barcode text(64) NOT NULL,
    scanned_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at text
  )
`

const window = { from: '2026-09-08T00:00:00.000Z', to: '2026-10-08T10:00:00.000Z', limit: 500 }

let client: Client
let db: LibSQLDatabase<Record<string, unknown>>

const insert = async (scanned_at: string, options: { product_id?: number; product_barcode?: string; deleted_at?: string } = {}) => {
  await client.execute({
    sql: 'INSERT INTO scan_history (product_id, product_barcode, scanned_at, deleted_at) VALUES (?, ?, ?, ?)',
    args: [options.product_id ?? 1, options.product_barcode ?? '5449000054227', scanned_at, options.deleted_at ?? null],
  })
}

beforeEach(async () => {
  client = createClient({ url: ':memory:' })
  db = drizzle(client) as LibSQLDatabase<Record<string, unknown>>
  await client.execute(create_table)
})

afterEach(() => {
  client.close()
  mock.restore()
})

describe('query_scan_history_window against SQLite', () => {
  it('uses a test table that matches the real schema', async () => {
    const columns = (await client.execute('PRAGMA table_info(scan_history)')).rows.map((row) => row.name)
    expect(columns).toEqual(getTableConfig(table_scan_history).columns.map((column) => column.name))
  })

  it('returns only live scans inside the window, oldest first', async () => {
    await insert('2026-09-07 23:59:59') // before the window
    await insert('2026-10-01 18:30:00', { product_id: 2 })
    await insert('2026-09-08 00:00:00') // inclusive start
    await insert('2026-09-20 12:00:00', { deleted_at: '2026-09-21 00:00:00' })
    await insert('2026-10-08 10:00:00') // exclusive end

    expect(await query_scan_history_window(db, window)).toEqual({
      rows: [
        { scan_history_id: 3, product_id: 1, product_barcode: '5449000054227', scanned_at: '2026-09-08T00:00:00.000Z' },
        { scan_history_id: 2, product_id: 2, product_barcode: '5449000054227', scanned_at: '2026-10-01T18:30:00.000Z' },
      ],
      total: 2,
    })
  })

  it('compares rows saved as ISO text, with Z or an offset, in UTC', async () => {
    await insert('2026-09-10T08:00:00Z')
    await insert('2026-09-09 12:00:00')
    await insert('2026-09-08T01:30:00+02:00') // 2026-09-07 23:30 UTC: before the window
    await insert('2026-10-08T11:00:00+02:00') // 2026-10-08 09:00 UTC: inside the window

    const result = await query_scan_history_window(db, window)
    expect(result.rows.map((row) => row.scanned_at)).toEqual(['2026-09-09T12:00:00.000Z', '2026-09-10T08:00:00.000Z', '2026-10-08T09:00:00.000Z'])
    expect(result.total).toBe(3)
  })

  it('leaves unparseable timestamps out of every window', async () => {
    await insert('not a date')
    await insert('2026-09-10 08:00:00')

    expect((await query_scan_history_window(db, window)).total).toBe(1)
  })

  it('keeps the most recent rows when limited, oldest first, while counting the whole window', async () => {
    for (let day = 10; day < 20; day++) await insert(`2026-09-${day} 08:00:00`)

    const result = await query_scan_history_window(db, { ...window, limit: 3 })
    expect(result.rows.map((row) => row.scanned_at)).toEqual(['2026-09-17T08:00:00.000Z', '2026-09-18T08:00:00.000Z', '2026-09-19T08:00:00.000Z'])
    expect(result.total).toBe(10)
  })

  it('does not return a second-precision row before a millisecond start', async () => {
    await insert('2026-10-08 09:00:00')
    await insert('2026-10-08 09:00:01')

    const result = await query_scan_history_window(db, { ...window, from: '2026-10-08T09:00:00.250Z' })
    expect(result.rows.map((row) => row.scanned_at)).toEqual(['2026-10-08T09:00:01.000Z'])
  })

  it('returns an empty window', async () => {
    expect(await query_scan_history_window(db, window)).toEqual({ rows: [], total: 0 })
  })
})

describe('service_scan_history.find_window', () => {
  const payload = { user_id: 7, tenants: [{ tenant_id: 7, tenant_type: 'user' as const, tenant_schema_version: 'user-schema-v1' }] }
  const cola = {
    product_id: 1,
    product_barcode: '5449000054227',
    product_type: 'food',
    product_name: 'Example Cola 330 ml',
    product_nova_group: 4,
    product_ecoscore: null,
    product_nutriscore: 'e',
    brand_name: 'Example Cola',
  }

  it('checks access, then attaches each scan to its product from the main database', async () => {
    const check_access = spyOn(service_access, 'check_access').mockImplementation(async () => {})
    const find_products = spyOn(service_product, 'find').mockImplementation(
      async () => ({ rows: null, pages: null, page: 1, take: 1, data: [cola] }) as never,
    )
    await insert('2026-09-10 08:00:00')
    await insert('2026-09-11 08:00:00')
    await insert('2026-09-12 08:00:00', { product_id: 2, product_barcode: '3017620422003' })

    const result = await service_scan_history.find_window(window, payload, db)

    expect(check_access).toHaveBeenCalledWith({ tenant_id: 7 }, payload)
    // Each product is requested once, with only the columns Historian uses.
    expect(find_products).toHaveBeenCalledTimes(1)
    expect(find_products.mock.calls[0]![0]).toMatchObject({
      columns: [
        'product_id',
        'product_barcode',
        'product_type',
        'product_name',
        'product_nova_group',
        'product_ecoscore',
        'product_nutriscore',
        'brand_name',
      ],
      product_id: [1, 2],
      take: 2,
    })
    expect(result).toEqual({
      scans: [
        { scan_history_id: 1, product_id: 1, product_barcode: '5449000054227', scanned_at: '2026-09-10T08:00:00.000Z', product: cola },
        { scan_history_id: 2, product_id: 1, product_barcode: '5449000054227', scanned_at: '2026-09-11T08:00:00.000Z', product: cola },
        // The main database no longer has product 2.
        { scan_history_id: 3, product_id: 2, product_barcode: '3017620422003', scanned_at: '2026-09-12T08:00:00.000Z', product: null },
      ],
      total: 3,
    })
  })

  it('does not query products for an empty window', async () => {
    spyOn(service_access, 'check_access').mockImplementation(async () => {})
    const find_products = spyOn(service_product, 'find')

    expect(await service_scan_history.find_window(window, payload, db)).toEqual({ scans: [], total: 0 })
    expect(find_products).not.toHaveBeenCalled()
  })

  it('reads nothing when access is denied', async () => {
    spyOn(service_access, 'check_access').mockImplementation(async () => {
      throw new Error('forbidden')
    })
    const find_products = spyOn(service_product, 'find')
    await insert('2026-09-10 08:00:00')

    await expect(service_scan_history.find_window(window, payload, db)).rejects.toThrow('forbidden')
    expect(find_products).not.toHaveBeenCalled()
  })
})
