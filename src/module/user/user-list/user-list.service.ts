import type { lib_dto_payload } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { eq } from 'drizzle-orm'
import { db_client } from '@db/client.db'
import { table_user_list } from '@db/user.schema.db'
import { select } from '@db/utils.db'

import { lib_error } from '@lib/error.lib'

import { service_product } from '@module/main/product/product.service'
import { service_access } from '@module/tenant/access/access.service'
import { dto_user_list } from '@module/user/user-list/user-list.dto'

export const service_user_list = {
  async find(query: Static<typeof dto_user_list.find.query>, payload: lib_dto_payload): Promise<Static<typeof dto_user_list.find.response>> {
    const tenant_id = payload.user_id
    await service_access.check_access({ tenant_id }, payload)

    const db = db_client({ tenant_id, payload })

    const result = await select({
      db,
      table: table_user_list,
      allowed_columns: {
        user_list_id: table_user_list.user_list_id,
        product_id: table_user_list.product_id,
        user_list_type: table_user_list.user_list_type,
        created_at: table_user_list.created_at,
      },
      where: [
        [table_user_list.user_list_id, query.user_list_id, '[]'],
        [table_user_list.product_id, query.product_id, '[]'],
        [table_user_list.user_list_type, query.user_list_type, '[]'],
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

  async create(body: Static<typeof dto_user_list.create.body>, payload: lib_dto_payload): Promise<Static<typeof dto_user_list.create.response>> {
    const tenant_id = payload.user_id
    await service_access.check_access({ tenant_id }, payload)

    const { product_id, user_list_type } = body

    try {
      await service_product.find({ columns: ['product_id'], product_id: [product_id], take: 1 })
    } catch (error: unknown) {
      throw error
    }

    try {
      await this.find({ columns: ['product_id'], product_id: [product_id], take: 1 }, payload)
      throw lib_error.bad_request
    } catch (error: unknown) {
      const err = error as { code?: string }
      if (err?.code !== 'not-found' && err?.code !== 'not-found-user-list') {
        throw error
      }
    }

    const db = db_client({ tenant_id, payload })

    const [data] = await db
      .insert(table_user_list)
      .values({
        product_id,
        user_list_type,
      })
      .returning()

    if (!data) throw lib_error.bad_request

    return {
      data: {
        ...data,
        user_list_type: data.user_list_type as any,
        product: null,
      },
    }
  },

  async update(body: Static<typeof dto_user_list.update.body>, payload: lib_dto_payload): Promise<Static<typeof dto_user_list.update.response>> {
    const tenant_id = payload.user_id
    await service_access.check_access({ tenant_id }, payload)

    const { product_id, user_list_type } = body

    await this.find({ columns: ['product_id'], product_id: [product_id], take: 1 }, payload)

    const db = db_client({ tenant_id, payload })

    const [data] = await db.update(table_user_list).set({ user_list_type }).where(eq(table_user_list.product_id, product_id)).returning()

    if (!data) throw lib_error.not_found

    return {
      data: {
        ...data,
        user_list_type: data.user_list_type as any,
        product: null,
      },
    }
  },

  async delete(body: Static<typeof dto_user_list.delete.body>, payload: lib_dto_payload): Promise<Static<typeof dto_user_list.delete.response>> {
    const tenant_id = payload.user_id
    await service_access.check_access({ tenant_id }, payload)

    const { product_id } = body

    await this.find({ columns: ['product_id'], product_id: [product_id], take: 1 }, payload)

    const db = db_client({ tenant_id, payload })

    const [data] = await db
      .update(table_user_list)
      .set({ deleted_at: new Date().toISOString() })
      .where(eq(table_user_list.product_id, product_id))
      .returning()

    if (!data) throw lib_error.not_found

    return {
      data: {
        ...data,
        user_list_type: data.user_list_type as any,
        product: null,
      },
    }
  },
}
