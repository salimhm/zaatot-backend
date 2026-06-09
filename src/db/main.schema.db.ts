import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const current_schema_version = {
  user: '0.0.1',
  organization: '0.0.1',
} as const

export const table_user = sqliteTable(
  'user',
  {
    user_id: integer('user_id').primaryKey({ autoIncrement: true }),
    user_phone: text('user_phone', { length: 24 }).notNull(),
    user_first_name: text('user_first_name', { length: 32 }).notNull(),
    user_last_name: text('user_last_name', { length: 32 }).notNull(),
    user_image: text('user_image', { length: 64 }),
    user_schema_version: text('user_schema_version').notNull().default('0.0.0'),
    user_db_id: text('user_db_id', { length: 512 }),
    user_db_url: text('user_db_url', { length: 512 }),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deleted_at: text('deleted_at'),
  },
  (table) => [
    uniqueIndex('user_phone_idx')
      .on(table.user_phone)
      .where(sql`deleted_at IS NULL`),
    index('user_first_name_idx').on(table.user_first_name),
    index('user_last_name_idx').on(table.user_last_name),
    index('user_deleted_at_idx').on(table.deleted_at),
  ],
)

export const table_organization = sqliteTable(
  'organization',
  {
    organization_id: integer('organization_id').primaryKey({ autoIncrement: true }),
    organization_name: text('organization_name', { length: 128 }).notNull(),
    organization_schema_version: text('organization_schema_version').notNull().default('0.0.0'),
    organization_db_id: text('organization_db_id', { length: 512 }),
    organization_db_url: text('organization_db_url', { length: 512 }),
    user_id: integer('user_id').notNull(),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deleted_at: text('deleted_at'),
  },
  (table) => [
    index('organization_user_id_idx').on(table.user_id),
    index('organization_name_idx').on(table.organization_name),
    index('organization_deleted_at_idx').on(table.deleted_at),
  ],
)

export const table_organization_user = sqliteTable(
  'organization_user',
  {
    organization_user_id: integer('organization_user_id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id').notNull(),
    user_id: integer('user_id').notNull(),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deleted_at: text('deleted_at'),
  },
  (table) => [
    index('organization_user_organization_id_idx').on(table.organization_id),
    index('organization_user_user_id_idx').on(table.user_id),
    uniqueIndex('organization_user_organization_id_user_id_idx')
      .on(table.organization_id, table.user_id)
      .where(sql`deleted_at IS NULL`),
    index('organization_user_deleted_at_idx').on(table.deleted_at),
  ],
)
