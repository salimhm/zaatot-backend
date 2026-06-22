import type { lib_dto_payload } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { lib_error } from '@lib/error.lib'

import { service_brand } from '@module/main/brand/brand.service'
import { service_product_provider } from '@module/main/product-provider/product-provider.service'
import { service_product } from '@module/main/product/product.service'
import { dto_scan } from '@module/main/scan/scan.dto'
import { service_scan_history } from '@module/user/scan-history/scan-history.service'

export const service_scan = {
  async scan_barcode(body: Static<typeof dto_scan.barcode.body>, payload: lib_dto_payload): Promise<Static<typeof dto_scan.barcode.response>> {
    const { barcode } = body

    let product: any = null

    try {
      const existing_res = await service_product.find({
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
        product_barcode: [barcode],
        take: 1,
      })

      const found_product = existing_res.data[0]
      if (found_product) {
        product = found_product
      }
    } catch (error: unknown) {
      const err = error as { code?: string }
      if (err?.code !== 'not-found' && err?.code !== 'not-found-product') {
        throw error
      }
    }

    if (product != null) {
      if (product.product_id == null) {
        throw lib_error.bad_request
      }

      await service_scan_history.create(
        {
          product_id: product.product_id,
          product_barcode: barcode,
        },
        payload,
      )

      return {
        data: {
          product: product as any,
          source: 'cache',
        },
      }
    }

    const provider_product = await service_product_provider.fetch_by_barcode(barcode)
    if (!provider_product) {
      throw lib_error.not_found
    }

    let brand = null
    if (provider_product.product_brand_name) {
      brand = await service_brand.find_or_create_by_name(provider_product.product_brand_name)
    }

    const new_product_res = await service_product.create({
      product_barcode: provider_product.product_barcode,
      product_type: provider_product.product_type as any,
      product_name: provider_product.product_name || undefined,
      brand_id: brand ? brand.brand_id : undefined,
      product_images: provider_product.product_images || undefined,
      product_nova_group: provider_product.product_nova_group ?? undefined,
      product_ecoscore: provider_product.product_ecoscore ?? undefined,
      product_nutriscore: provider_product.product_nutriscore ?? undefined,
      product_metadata: provider_product.product_metadata || undefined,
    })

    const new_product = new_product_res.data

    await service_scan_history.create(
      {
        product_id: new_product.product_id,
        product_barcode: barcode,
      },
      payload,
    )

    return {
      data: {
        product: {
          ...new_product,
          brand_name: brand ? brand.brand_name : null,
          brand_is_boycotted: brand ? brand.brand_is_boycotted : null,
          brand_boycott_reasons: brand ? brand.brand_boycott_reasons : null,
          brand_boycott_alternatives: brand ? brand.brand_boycott_alternatives : null,
        } as any,
        source: 'provider',
      },
    }
  },
}
