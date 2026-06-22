import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export * from './tenant.schema.db'

export const table_scan_history = sqliteTable(
  'scan_history',
  {
    scan_history_id: integer('scan_history_id').primaryKey({ autoIncrement: true }),
    product_id: integer('product_id').notNull(),
    product_barcode: text('product_barcode', { length: 64 }).notNull(),
    scanned_at: text('scanned_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deleted_at: text('deleted_at'),
  },
  (table) => [
    index('scan_history_product_id_idx').on(table.product_id),
    index('scan_history_product_barcode_idx').on(table.product_barcode),
    index('scan_history_scanned_at_idx').on(table.scanned_at),
    index('scan_history_deleted_at_idx').on(table.deleted_at),
  ],
)

export const table_user_list = sqliteTable(
  'user_list',
  {
    user_list_id: integer('user_list_id').primaryKey({ autoIncrement: true }),
    product_id: integer('product_id').notNull(),
    user_list_type: text('user_list_type').notNull(),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deleted_at: text('deleted_at'),
  },
  (table) => [
    uniqueIndex('user_list_product_id_idx')
      .on(table.product_id)
      .where(sql`deleted_at IS NULL`),
    index('user_list_type_idx').on(table.user_list_type),
    index('user_list_deleted_at_idx').on(table.deleted_at),
  ],
)
