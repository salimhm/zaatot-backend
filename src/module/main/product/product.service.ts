import type { Static } from 'elysia'

import { and, eq, isNull } from 'drizzle-orm'
import { db_client } from '@db/client.db'
import { table_brand, table_product } from '@db/main.schema.db'
import { select } from '@db/utils.db'

import { lib_error } from '@lib/error.lib'

import { dto_product } from '@module/main/product/product.dto'

export const service_product = {
  async find(query: Static<typeof dto_product.find.query>): Promise<Static<typeof dto_product.find.response>> {
    const { product_id, product_barcode, product_type, product_name, brand_id, product_nova_group, product_ecoscore, product_nutriscore } = query
    const db = db_client()

    return await select({
      db,
      table: table_product,
      allowed_columns: {
        product_id: table_product.product_id,
        product_barcode: table_product.product_barcode,
        product_type: table_product.product_type,
        product_name: table_product.product_name,
        brand_id: table_product.brand_id,
        product_images: table_product.product_images,
        product_nova_group: table_product.product_nova_group,
        product_ecoscore: table_product.product_ecoscore,
        product_nutriscore: table_product.product_nutriscore,
        product_metadata: table_product.product_metadata,
        updated_at: table_product.updated_at,
        created_at: table_product.created_at,
        brand_name: table_brand.brand_name,
        brand_is_boycotted: table_brand.brand_is_boycotted,
        brand_boycott_reasons: table_brand.brand_boycott_reasons,
        brand_boycott_alternatives: table_brand.brand_boycott_alternatives,
      },
      where: [
        [table_product.product_id, product_id, '[]'],
        [table_product.product_barcode, product_barcode, '[]'],
        [table_product.product_type, product_type, '[]'],
        [table_product.product_name, product_name, '%'],
        [table_product.brand_id, brand_id, '[]'],
        [table_product.product_nova_group, product_nova_group, '[]'],
        [table_product.product_ecoscore, product_ecoscore, '[]'],
        [table_product.product_nutriscore, product_nutriscore, '[]'],
      ],
      query,
      joins: [
        {
          table_to_join: table_brand,
          column_to_join: 'brand_id',
        },
      ],
    })
  },

  async create(body: Static<typeof dto_product.create.body>): Promise<Static<typeof dto_product.create.response>> {
    const db = db_client()

    const [existing] = await db
      .select({ product_id: table_product.product_id })
      .from(table_product)
      .where(and(eq(table_product.product_barcode, body.product_barcode), isNull(table_product.deleted_at)))
      .limit(1)

    if (existing) throw lib_error.bad_request

    const [data] = await db.insert(table_product).values(body).returning()
    if (!data) throw lib_error.bad_request

    const { deleted_at, ...response_data } = data
    return { data: response_data as Static<typeof dto_product.create.response>['data'] }
  },

  async update(body: Static<typeof dto_product.update.body>): Promise<Static<typeof dto_product.update.response>> {
    const { product_id, ...values } = body
    const db = db_client()

    const [data] = await db
      .update(table_product)
      .set({ ...values, updated_at: new Date().toISOString() })
      .where(and(eq(table_product.product_id, product_id), isNull(table_product.deleted_at)))
      .returning()

    if (!data) throw lib_error.bad_request

    const { deleted_at, ...response_data } = data
    return { data: response_data as Static<typeof dto_product.update.response>['data'] }
  },

  async delete(body: Static<typeof dto_product.delete.body>): Promise<Static<typeof dto_product.delete.response>> {
    const { product_id } = body
    const db = db_client()

    const [data] = await db
      .update(table_product)
      .set({ deleted_at: new Date().toISOString() })
      .where(and(eq(table_product.product_id, product_id), isNull(table_product.deleted_at)))
      .returning()

    if (!data) throw lib_error.bad_request

    const { deleted_at, ...response_data } = data
    return { data: response_data as Static<typeof dto_product.delete.response>['data'] }
  },
}
