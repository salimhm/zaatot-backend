import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const table_file = sqliteTable(
  'file',
  {
    file_id: text('file_id', { length: 64 }).primaryKey(),
    file_name: text('file_name', { length: 127 }),
    user_id: integer('user_id').notNull(),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deleted_at: text('deleted_at'),
  },
  (table) => [index('file_deleted_at_idx').on(table.deleted_at)],
)

export const table_access = sqliteTable(
  'access',
  {
    access_id: integer('access_id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id').notNull(),
    actions: text('actions', { mode: 'json' })
      .notNull()
      .$type<string[]>()
      .default(sql`'[]'`),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deleted_at: text('deleted_at'),
  },
  (table) => [
    uniqueIndex('access_user_id_idx')
      .on(table.user_id)
      .where(sql`deleted_at IS NULL`),
    index('access_deleted_at_idx').on(table.deleted_at),
  ],
)
