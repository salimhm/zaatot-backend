import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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

export const entity_access = sqliteTable(
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
  (table) => [index('access_user_id_idx').on(table.user_id), index('access_deleted_at_idx').on(table.deleted_at)],
)

export const table_contact = sqliteTable(
  'contact',
  {
    contact_id: integer('contact_id').primaryKey({ autoIncrement: true }),
    contact_phone: text('contact_phone', { length: 18 }).notNull(),
    contact_name: text('contact_name', { length: 127 }),
    contact_gender: text('contact_gender', { length: 16 }),
    contact_birthday: text('contact_birthday', { length: 32 }),
    contact_national_id: text('contact_national_id', { length: 64 }),
    contact_passport_id: text('contact_passport_id', { length: 64 }),
    contact_address: text('contact_address', { length: 255 }),
    contact_city: text('contact_city', { length: 64 }),
    contact_country: text('contact_country', { length: 64 }),
    contact_nationality: text('contact_nationality', { length: 64 }),
    contact_status: integer('contact_status').default(1),
    contact_metadata: text('contact_metadata', { mode: 'json' }),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deleted_at: text('deleted_at'),
  },
  (table) => [
    index('contact_phone_idx').on(table.contact_phone),
    index('contact_name_idx').on(table.contact_name),
    index('contact_deleted_at_idx').on(table.deleted_at),
  ],
)
