import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const table_user = sqliteTable(
  'user',
  {
    user_id: integer('user_id').primaryKey({ autoIncrement: true }),
    user_phone: text('user_phone', { length: 24 }).notNull(),
    user_first_name: text('user_first_name', { length: 32 }).notNull(),
    user_last_name: text('user_last_name', { length: 32 }).notNull(),
    user_image: text('user_image', { length: 32 }),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deleted_at: text('deleted_at'),
  },
  (table) => [
    index('user_phone_idx').on(table.user_phone),
    index('user_first_name_idx').on(table.user_first_name),
    index('user_last_name_idx').on(table.user_last_name),
    index('user_deleted_at_idx').on(table.deleted_at),
  ],
)

export const current_tenant_schema_version = '0.0.5'

export const table_tenant = sqliteTable(
  'tenant',
  {
    tenant_id: integer('tenant_id').primaryKey({ autoIncrement: true }),
    tenant_type: text('tenant_type').notNull(),
    tenant_schema_version: text('tenant_schema_version').notNull().default('0.0.0'),
    tenant_name: text('tenant_name', { length: 32 }).notNull(),
    tenant_db_id: text('tenant_db_id', { length: 512 }),
    tenant_db_url: text('tenant_db_url', { length: 512 }),
    user_id: integer('user_id').notNull(),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deleted_at: text('deleted_at'),
  },
  (table) => [index('tenant_user_id_idx').on(table.user_id)],
)

export const entity_user_tenant = sqliteTable(
  'user_tenant',
  {
    user_tenant_id: integer('user_tenant_id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id').notNull(),
    tenant_id: integer('tenant_id').notNull(),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deleted_at: text('deleted_at'),
  },
  (table) => [
    index('user_tenant_user_id_idx').on(table.user_id),
    index('user_tenant_tenant_id_idx').on(table.tenant_id),
    index('user_tenant_deleted_at_idx').on(table.deleted_at),
  ],
)

export const table_otp = sqliteTable(
  'otp',
  {
    otp_id: integer('otp_id').primaryKey({ autoIncrement: true }),
    otp_action: text('otp_action').notNull(),
    otp_code: text('otp_code', { length: 4 }).notNull(),
    user_phone: text('user_phone', { length: 24 }).notNull(),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    expires_at: text('expires_at').notNull(),
  },
  (table) => [index('otp_user_phone_idx').on(table.user_phone)],
)
