import type { Static } from 'elysia'

import { and, asc, eq, isNull } from 'drizzle-orm'
import { db_client } from '@db/client.db'
import { table_brand, table_product, table_product_fact, table_product_nutrient } from '@db/main.schema.db'
import { select } from '@db/utils.db'

import { lib_error } from '@lib/error.lib'

import { product_nutrition_completeness } from '@module/main/product/product-nutrition.util'
import { dto_product } from '@module/main/product/product.dto'

export const service_product = {
  async find_composition_by_barcode(
    query: Static<typeof dto_product.find_composition_by_barcode.query>,
  ): Promise<Static<typeof dto_product.find_composition_by_barcode.response>> {
    const db = db_client()
    const [fact] = await db
      .select({
        product_id: table_product.product_id,
        product_barcode: table_product.product_barcode,
        product_name: table_product.product_name,
        product_ingredients: table_product_fact.product_ingredients,
        product_allergens: table_product_fact.product_allergens,
        ingredients_complete: table_product_fact.ingredients_complete,
        allergens_complete: table_product_fact.allergens_complete,
        source_name: table_product_fact.source_name,
        source_url: table_product_fact.source_url,
        fetched_at: table_product_fact.fetched_at,
        fresh_until: table_product_fact.fresh_until,
      })
      .from(table_product)
      .innerJoin(table_product_fact, eq(table_product_fact.product_id, table_product.product_id))
      .where(
        and(
          eq(table_product.product_barcode, query.barcode),
          isNull(table_product.deleted_at),
          eq(table_product_fact.fact_status, 'active'),
          isNull(table_product_fact.deleted_at),
        ),
      )
      .limit(1)

    if (!fact) return { data: null }

    return {
      data: {
        variant: {
          product_id: fact.product_id,
          product_barcode: fact.product_barcode,
          product_name: fact.product_name,
        },
        ingredients: [...fact.product_ingredients],
        allergens: [...fact.product_allergens],
        completeness: {
          ingredients: fact.ingredients_complete,
          allergens: fact.allergens_complete,
        },
        source: {
          provider: fact.source_name,
          url: fact.source_url,
          retrieved_at: fact.fetched_at,
          fresh_until: fact.fresh_until,
        },
      },
    }
  },

  async find_nutrition_by_barcode(
    query: Static<typeof dto_product.find_nutrition_by_barcode.query>,
  ): Promise<Static<typeof dto_product.find_nutrition_by_barcode.response>> {
    const db = db_client()
    const [fact] = await db
      .select({
        product_id: table_product.product_id,
        product_barcode: table_product.product_barcode,
        product_name: table_product.product_name,
        product_fact_id: table_product_fact.product_fact_id,
        nutrition_complete: table_product_fact.nutrition_complete,
        serving_size: table_product_fact.serving_size,
        serving_unit: table_product_fact.serving_unit,
        source_name: table_product_fact.source_name,
        source_url: table_product_fact.source_url,
        fetched_at: table_product_fact.fetched_at,
        fresh_until: table_product_fact.fresh_until,
      })
      .from(table_product)
      .innerJoin(table_product_fact, eq(table_product_fact.product_id, table_product.product_id))
      .where(
        and(
          eq(table_product.product_barcode, query.barcode),
          isNull(table_product.deleted_at),
          eq(table_product_fact.fact_status, 'active'),
          isNull(table_product_fact.deleted_at),
        ),
      )
      .limit(1)

    if (!fact) return { data: null }

    const nutrients = await db
      .select({
        code: table_product_nutrient.nutrient_code,
        value: table_product_nutrient.nutrient_value,
        unit: table_product_nutrient.nutrient_unit,
        basis: table_product_nutrient.nutrient_basis,
      })
      .from(table_product_nutrient)
      .where(and(eq(table_product_nutrient.product_fact_id, fact.product_fact_id), isNull(table_product_nutrient.deleted_at)))
      .orderBy(asc(table_product_nutrient.nutrient_code), asc(table_product_nutrient.nutrient_basis), asc(table_product_nutrient.nutrient_unit))

    return {
      data: {
        variant: {
          product_id: fact.product_id,
          product_barcode: fact.product_barcode,
          product_name: fact.product_name,
        },
        serving: fact.serving_size !== null && fact.serving_unit !== null ? { value: fact.serving_size, unit: fact.serving_unit } : null,
        nutrients,
        sources: [
          {
            provider: fact.source_name,
            url: fact.source_url,
            retrieved_at: fact.fetched_at,
            fresh_until: fact.fresh_until,
          },
        ],
        completeness: product_nutrition_completeness(nutrients, fact.nutrition_complete),
      },
    }
  },

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
