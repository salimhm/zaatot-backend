import type { Static } from 'elysia'

import { and, eq, isNull } from 'drizzle-orm'
import { db_client } from '@db/client.db'
import { table_brand } from '@db/main.schema.db'
import { select } from '@db/utils.db'

import { lib_error } from '@lib/error.lib'

import { dto_brand } from '@module/main/brand/brand.dto'

export const service_brand = {
  async find(query: Static<typeof dto_brand.find.query>): Promise<Static<typeof dto_brand.find.response>> {
    const { brand_id, brand_name, brand_is_boycotted } = query
    const db = db_client()

    return await select({
      db,
      table: table_brand,
      allowed_columns: {
        brand_id: table_brand.brand_id,
        brand_name: table_brand.brand_name,
        brand_is_boycotted: table_brand.brand_is_boycotted,
        brand_boycott_reasons: table_brand.brand_boycott_reasons,
        brand_boycott_alternatives: table_brand.brand_boycott_alternatives,
        created_at: table_brand.created_at,
      },
      where: [
        [table_brand.brand_id, brand_id, '[]'],
        [table_brand.brand_name, brand_name, '%'],
        [table_brand.brand_is_boycotted, brand_is_boycotted, '[]'],
      ],
      query,
    })
  },

  async create(body: Static<typeof dto_brand.create.body>): Promise<Static<typeof dto_brand.create.response>> {
    const db = db_client()
    const normalized = body.brand_name.trim().toLowerCase()

    const [existing] = await db
      .select({ brand_id: table_brand.brand_id })
      .from(table_brand)
      .where(and(eq(table_brand.brand_name, normalized), isNull(table_brand.deleted_at)))
      .limit(1)

    if (existing) throw lib_error.bad_request

    const [data] = await db
      .insert(table_brand)
      .values({
        ...body,
        brand_name: normalized,
      })
      .returning()

    if (!data) throw lib_error.bad_request

    const { deleted_at, ...response_data } = data
    return { data: response_data as Static<typeof dto_brand.create.response>['data'] }
  },

  async update(body: Static<typeof dto_brand.update.body>): Promise<Static<typeof dto_brand.update.response>> {
    const { brand_id, ...values } = body
    const db = db_client()

    if (values.brand_name !== undefined) {
      values.brand_name = values.brand_name.trim().toLowerCase()
    }

    const [data] = await db
      .update(table_brand)
      .set(values)
      .where(and(eq(table_brand.brand_id, brand_id), isNull(table_brand.deleted_at)))
      .returning()

    if (!data) throw lib_error.bad_request

    const { deleted_at, ...response_data } = data
    return { data: response_data as Static<typeof dto_brand.update.response>['data'] }
  },

  async delete(body: Static<typeof dto_brand.delete.body>): Promise<Static<typeof dto_brand.delete.response>> {
    const { brand_id } = body
    const db = db_client()

    const [data] = await db
      .update(table_brand)
      .set({ deleted_at: new Date().toISOString() })
      .where(and(eq(table_brand.brand_id, brand_id), isNull(table_brand.deleted_at)))
      .returning()

    if (!data) throw lib_error.bad_request

    const { deleted_at, ...response_data } = data
    return { data: response_data as Static<typeof dto_brand.delete.response>['data'] }
  },

  async find_or_create_by_name(name: string): Promise<Static<typeof dto_brand.create.response>['data']> {
    const db = db_client()
    const normalized = name.trim().toLowerCase()

    const [existing] = await db
      .select({
        brand_id: table_brand.brand_id,
        brand_name: table_brand.brand_name,
        brand_is_boycotted: table_brand.brand_is_boycotted,
        brand_boycott_reasons: table_brand.brand_boycott_reasons,
        brand_boycott_alternatives: table_brand.brand_boycott_alternatives,
        created_at: table_brand.created_at,
      })
      .from(table_brand)
      .where(and(eq(table_brand.brand_name, normalized), isNull(table_brand.deleted_at)))
      .limit(1)

    if (existing) {
      return existing
    }

    const [created] = await db
      .insert(table_brand)
      .values({
        brand_name: normalized,
        brand_is_boycotted: false,
        brand_boycott_reasons: [],
        brand_boycott_alternatives: [],
      })
      .returning()

    if (!created) throw lib_error.bad_request

    const { deleted_at, ...response_data } = created
    return response_data
  },
}
