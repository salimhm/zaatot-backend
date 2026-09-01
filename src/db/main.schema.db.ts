import { sql } from 'drizzle-orm'
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const current_schema_version = {
  user: '0.0.2',
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

export const table_product = sqliteTable(
  'product',
  {
    product_id: integer('product_id').primaryKey({ autoIncrement: true }),
    product_barcode: text('product_barcode', { length: 64 }).notNull(),
    product_type: text('product_type', { length: 32 }).notNull().default('food'),
    product_name: text('product_name', { length: 255 }),
    brand_id: integer('brand_id'),
    product_images: text('product_images', { mode: 'json' }).$type<string[]>(),
    product_nova_group: integer('product_nova_group'),
    product_ecoscore: text('product_ecoscore'),
    product_nutriscore: text('product_nutriscore'),
    product_metadata: text('product_metadata', { mode: 'json' }).$type<{
      ingredients: string[] | null
      allergens: string[]
    }>(),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deleted_at: text('deleted_at'),
  },
  (table) => [
    uniqueIndex('product_barcode_idx')
      .on(table.product_barcode)
      .where(sql`deleted_at IS NULL`),
    index('product_name_idx').on(table.product_name),
    index('product_type_idx').on(table.product_type),
    index('product_brand_id_idx')
      .on(table.brand_id)
      .where(sql`deleted_at IS NULL`),
    index('product_deleted_at_idx').on(table.deleted_at),
    index('product_nova_group_idx')
      .on(table.product_nova_group)
      .where(sql`deleted_at IS NULL`),
    index('product_ecoscore_idx')
      .on(table.product_ecoscore)
      .where(sql`deleted_at IS NULL`),
    index('product_nutriscore_idx')
      .on(table.product_nutriscore)
      .where(sql`deleted_at IS NULL`),
  ],
)

/** Stores immutable, versioned product facts and their provenance in the shared knowledge database. */
export const table_product_fact = sqliteTable(
  'product_fact',
  {
    // Uniquely identifies this stored product-fact revision.
    product_fact_id: integer('product_fact_id').primaryKey({ autoIncrement: true }),
    // References the shared product described by these facts.
    product_id: integer('product_id').notNull(),
    // Increases whenever validated facts for the product change.
    product_fact_version: integer('product_fact_version').notNull(),
    // Stores whether this fact revision is active, disputed, superseded, or otherwise unavailable.
    fact_status: text('fact_status', { length: 32 }).notNull(),
    // Stores an optional stable identifier for the upstream provider record or source document.
    source_id: text('source_id', { length: 128 }),
    // Stores the human-readable provider or source name.
    source_name: text('source_name', { length: 255 }).notNull(),
    // Stores an optional URL where the source facts can be reviewed.
    source_url: text('source_url', { length: 1024 }),
    // Stores normalized ingredient codes used by safety and preference rules.
    product_ingredients: text('product_ingredients', { mode: 'json' })
      .notNull()
      .$type<string[]>()
      .default(sql`'[]'`),
    // Stores normalized allergen codes used by hard safety gates.
    product_allergens: text('product_allergens', { mode: 'json' })
      .notNull()
      .$type<string[]>()
      .default(sql`'[]'`),
    // Stores normalized numeric nutrient values such as sugar, protein, salt, fat, fibre, and energy.
    product_nutrients: text('product_nutrients', { mode: 'json' })
      .notNull()
      .$type<Record<string, number | null>>()
      .default(sql`'{}'`),
    // Stores the numeric quantity represented by one serving when the source provides it.
    serving_size: real('serving_size'),
    // Stores the unit associated with serving_size, such as g, ml, or item.
    serving_unit: text('serving_unit', { length: 16 }),
    // Records when the application or provider observed this fact revision.
    observed_at: text('observed_at').notNull(),
    // Records when this fact revision should be treated as stale unless revalidated.
    fresh_until: text('fresh_until'),
    // Stores a digest used to detect duplicate or unexpectedly changed fact payloads.
    product_fact_hash: text('product_fact_hash', { length: 128 }).notNull(),
    // Records when this fact revision was persisted.
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    // Supports controlled soft deletion while preserving historical fact revisions.
    deleted_at: text('deleted_at'),
  },
  (table) => [
    uniqueIndex('product_fact_product_id_version_idx')
      .on(table.product_id, table.product_fact_version)
      .where(sql`deleted_at IS NULL`),
    index('product_fact_status_idx').on(table.fact_status),
    index('product_fact_source_id_idx').on(table.source_id),
    index('product_fact_fresh_until_idx').on(table.fresh_until),
    index('product_fact_deleted_at_idx').on(table.deleted_at),
  ],
)

export const table_brand = sqliteTable(
  'brand',
  {
    brand_id: integer('brand_id').primaryKey({ autoIncrement: true }),
    brand_name: text('brand_name', { length: 255 }).notNull(),
    brand_is_boycotted: integer('brand_is_boycotted', { mode: 'boolean' }).notNull().default(false),
    brand_boycott_reasons: text('brand_boycott_reasons', { mode: 'json' })
      .$type<string[]>()
      .default(sql`'[]'`),
    brand_boycott_alternatives: text('brand_boycott_alternatives', { mode: 'json' })
      .$type<string[]>()
      .default(sql`'[]'`),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deleted_at: text('deleted_at'),
  },
  (table) => [
    uniqueIndex('brand_name_idx')
      .on(table.brand_name)
      .where(sql`deleted_at IS NULL`),
    index('brand_is_boycotted_idx')
      .on(table.brand_is_boycotted)
      .where(sql`deleted_at IS NULL`),
    index('brand_deleted_at_idx').on(table.deleted_at),
  ],
)
