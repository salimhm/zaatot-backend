import type { lib_dto_payload } from '@lib/dto.lib'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { Static } from 'elysia'

import { and, desc, gte, isNull, lt, sql } from 'drizzle-orm'
import { db_client } from '@db/client.db'
import { table_scan_history } from '@db/user.schema.db'
import { select } from '@db/utils.db'

import { lib_error } from '@lib/error.lib'

import { service_product } from '@module/main/product/product.service'
import { service_access } from '@module/tenant/access/access.service'
import { dto_scan_history, dto_schema_scan_history } from '@module/user/scan-history/scan-history.dto'

export type scan_history_window_product = {
  product_id: number
  product_barcode: string
  product_type: string | null
  product_name: string | null
  product_nova_group: number | null
  product_ecoscore: string | null
  product_nutriscore: string | null
  brand_name: string | null
}

export type scan_history_window_scan = {
  scan_history_id: number
  product_id: number
  product_barcode: string
  scanned_at: string
  product: scan_history_window_product | null
}

// scanned_at is SQLite CURRENT_TIMESTAMP text (UTC, `YYYY-MM-DD HH:MM:SS`) and only compares correctly against the
// same format. Rounding up to the next second keeps second-precision rows from landing before a millisecond bound.
export const to_sqlite_datetime = (iso: string) => new Date(Math.ceil(Date.parse(iso) / 1000) * 1000).toISOString().replace('T', ' ').slice(0, 19)

export const from_sqlite_datetime = (value: string) =>
  new Date(/(?:z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value.replace(' ', 'T')}Z`).toISOString()

// SQLite datetime() normalizes both CURRENT_TIMESTAMP text and ISO text (with Z or an offset) to UTC
// `YYYY-MM-DD HH:MM:SS`, so rows saved in either format compare correctly. Unparseable values become
// NULL and fall outside every window. It bypasses the scanned_at index, which is acceptable for one user's history.
const scanned_at_utc = sql<string | null>`datetime(${table_scan_history.scanned_at})`

// The SQL part of find_window, separated so it can run against a real database in tests.
export const query_scan_history_window = async (
  db: LibSQLDatabase<Record<string, unknown>>,
  query: { from: string; to: string; limit: number },
): Promise<{ rows: Omit<scan_history_window_scan, 'product'>[]; total: number }> => {
  const in_window = and(
    gte(scanned_at_utc, to_sqlite_datetime(query.from)),
    lt(scanned_at_utc, to_sqlite_datetime(query.to)),
    isNull(table_scan_history.deleted_at),
  )

  const [rows, counted] = await Promise.all([
    db
      .select({
        scan_history_id: table_scan_history.scan_history_id,
        product_id: table_scan_history.product_id,
        product_barcode: table_scan_history.product_barcode,
        scanned_at: scanned_at_utc,
      })
      .from(table_scan_history)
      .where(in_window)
      // Newest first so a limited read keeps the most recent scans; reversed below to oldest first.
      .orderBy(desc(scanned_at_utc), desc(table_scan_history.scan_history_id))
      .limit(query.limit),
    db
      .select({ total: sql<number>`count(*)` })
      .from(table_scan_history)
      .where(in_window),
  ])

  return {
    // The window filter guarantees a non-null scanned_at.
    rows: rows.reverse().map((row) => ({ ...row, scanned_at: from_sqlite_datetime(row.scanned_at!) })),
    total: Number(counted[0]?.total ?? 0),
  }
}

export const service_scan_history = {
  async find(query: Static<typeof dto_scan_history.find.query>, payload: lib_dto_payload): Promise<Static<typeof dto_scan_history.find.response>> {
    const tenant_id = payload.user_id
    await service_access.check_access({ tenant_id }, payload)

    const db = db_client({ tenant_id, payload })

    const result = await select({
      db,
      table: table_scan_history,
      allowed_columns: {
        scan_history_id: table_scan_history.scan_history_id,
        product_id: table_scan_history.product_id,
        product_barcode: table_scan_history.product_barcode,
        scanned_at: table_scan_history.scanned_at,
      },
      where: [
        [table_scan_history.scan_history_id, query.scan_history_id, '[]'],
        [table_scan_history.product_id, query.product_id, '[]'],
        [table_scan_history.product_barcode, query.product_barcode, '[]'],
      ],
      query,
    })

    if (result.data.length === 0) {
      return result
    }

    const product_ids = Array.from(new Set(result.data.map((item) => item.product_id).filter((id): id is number => id != null)))

    let products: any[] = []
    if (product_ids.length > 0) {
      const product_res = await service_product.find({
        columns: [
          'product_id',
          'product_barcode',
          'product_type',
          'product_name',
          'brand_id',
          'product_images',
          'product_nova_group',
          'product_ecoscore',
          'product_nutriscore',
          'product_metadata',
          'updated_at',
          'created_at',
          'brand_name',
          'brand_is_boycotted',
          'brand_boycott_reasons',
          'brand_boycott_alternatives',
        ],
        product_id: product_ids,
        take: product_ids.length,
      })
      products = product_res.data
    }

    const product_map = new Map(products.map((p) => [p.product_id, p]))

    const merged_data = result.data.map((item) => {
      const product = item.product_id != null ? product_map.get(item.product_id) || null : null
      return {
        ...item,
        product,
      }
    })

    return {
      ...result,
      data: merged_data as any[],
    }
  },

  // Reads one bounded window of the user's scans for Historian: the most recent `limit` scans, returned oldest first. `from` is inclusive,
  // `to` is exclusive, and both are UTC ISO instants. `total` counts every scan in the window.
  async find_window(
    query: { from: string; to: string; limit: number },
    payload: lib_dto_payload,
    // Tests pass an in-memory database; production always opens the user's own database.
    user_db?: LibSQLDatabase<Record<string, unknown>>,
  ): Promise<{ scans: scan_history_window_scan[]; total: number }> {
    const tenant_id = payload.user_id
    await service_access.check_access({ tenant_id }, payload)

    const db = user_db ?? db_client({ tenant_id, payload })
    const { rows, total } = await query_scan_history_window(db, query)

    // Products live in the shared main database, so they cannot be joined to the user's scans in SQL.
    const product_ids = Array.from(new Set(rows.map((row) => row.product_id)))
    const products =
      product_ids.length === 0
        ? []
        : (
            await service_product.find({
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
              product_id: product_ids,
              take: product_ids.length,
            })
          ).data
    const product_map = new Map(products.map((product) => [product.product_id, product as scan_history_window_product]))

    return {
      scans: rows.map((row) => ({
        scan_history_id: row.scan_history_id,
        product_id: row.product_id,
        product_barcode: row.product_barcode,
        scanned_at: row.scanned_at,
        product: product_map.get(row.product_id) ?? null,
      })),
      total,
    }
  },

  async create(body: { product_id: number; product_barcode: string }, payload: lib_dto_payload): Promise<Static<typeof dto_schema_scan_history>> {
    const tenant_id = payload.user_id
    await service_access.check_access({ tenant_id }, payload)

    const db = db_client({ tenant_id, payload })

    const [data] = await db
      .insert(table_scan_history)
      .values({
        product_id: body.product_id,
        product_barcode: body.product_barcode,
      })
      .returning()

    if (!data) throw lib_error.bad_request

    return {
      scan_history_id: data.scan_history_id,
      product_id: data.product_id,
      product_barcode: data.product_barcode,
      scanned_at: data.scanned_at,
      product: null,
    }
  },
}
