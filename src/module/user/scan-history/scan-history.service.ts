import type { lib_dto_payload } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { db_client } from '@db/client.db'
import { table_scan_history } from '@db/user.schema.db'
import { select } from '@db/utils.db'

import { lib_error } from '@lib/error.lib'

import { service_product } from '@module/main/product/product.service'
import { service_access } from '@module/tenant/access/access.service'
import { dto_scan_history, dto_schema_scan_history } from '@module/user/scan-history/scan-history.dto'

export const service_scan_history = {
  async find(query: Static<typeof dto_scan_history.find.query>, payload: lib_dto_payload): Promise<Static<typeof dto_scan_history.find.response>> {
    const tenant_id = payload.user_id
    await service_access.check_access({ tenant_id }, payload)

    const db = db_client({ tenant_id, payload })

    const result = await select({
      db,
      table: table_scan_history,
      allowed_columns: {
        scan_history_id: table_scan_history.scan_history_id,
        product_id: table_scan_history.product_id,
        product_barcode: table_scan_history.product_barcode,
        scanned_at: table_scan_history.scanned_at,
      },
      where: [
        [table_scan_history.scan_history_id, query.scan_history_id, '[]'],
        [table_scan_history.product_id, query.product_id, '[]'],
        [table_scan_history.product_barcode, query.product_barcode, '[]'],
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

  async create(body: { product_id: number; product_barcode: string }, payload: lib_dto_payload): Promise<Static<typeof dto_schema_scan_history>> {
    const tenant_id = payload.user_id
    await service_access.check_access({ tenant_id }, payload)

    const db = db_client({ tenant_id, payload })

    const [data] = await db
      .insert(table_scan_history)
      .values({
        product_id: body.product_id,
        product_barcode: body.product_barcode,
      })
      .returning()

    if (!data) throw lib_error.bad_request

    return {
      scan_history_id: data.scan_history_id,
      product_id: data.product_id,
      product_barcode: data.product_barcode,
      scanned_at: data.scanned_at,
      product: null,
    }
  },
}
