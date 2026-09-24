import { t } from 'elysia'

import { enum_ecoscore, enum_nova_group, enum_nutriscore } from '@lib/enum.lib'

import { dto_schema_product_metadata } from '@module/main/product/product.dto'

export const dto_schema_product_provider = t.Object({
  product_barcode: t.String(),
  product_type: t.String(),
  product_name: t.Union([t.String(), t.Null()]),
  product_brand_name: t.Union([t.String(), t.Null()]),
  product_brand_names: t.Array(t.String(), { maxItems: 5 }),
  product_images: t.Union([t.Array(t.String()), t.Null()]),
  product_nova_group: t.Union([t.UnionEnum(enum_nova_group), t.Null()]),
  product_ecoscore: t.Union([t.UnionEnum(enum_ecoscore), t.Null()]),
  product_nutriscore: t.Union([t.UnionEnum(enum_nutriscore), t.Null()]),
  product_metadata: t.Union([dto_schema_product_metadata, t.Null()]),
})

export const dto_product_provider = {
  fetch_by_barcode: {
    response: t.Object({
      data: t.Union([dto_schema_product_provider, t.Null()]),
    }),
  },
  search_by_product_name: {
    query: t.Object({
      product_name: t.String({ minLength: 2, maxLength: 255 }),
      take: t.Optional(t.Integer({ minimum: 1, maximum: 5 })),
      page: t.Optional(t.Integer({ minimum: 1, maximum: 1000 })),
    }),
    response: t.Object({
      data: t.Object({
        products: t.Array(dto_schema_product_provider),
        total: t.Integer({ minimum: 0 }),
        page: t.Integer({ minimum: 1 }),
        page_size: t.Integer({ minimum: 1, maximum: 5 }),
      }),
    }),
  },
  search_by_brand_name: {
    query: t.Object({
      brand_name: t.String({ minLength: 2, maxLength: 255 }),
      take: t.Optional(t.Integer({ minimum: 1, maximum: 5 })),
      page: t.Optional(t.Integer({ minimum: 1, maximum: 1000 })),
    }),
    response: t.Object({
      data: t.Union([
        t.Object({
          brand_name: t.String(),
          products: t.Array(dto_schema_product_provider),
          total: t.Integer({ minimum: 0 }),
          page: t.Integer({ minimum: 1 }),
          page_size: t.Integer({ minimum: 1, maximum: 5 }),
        }),
        t.Null(),
      ]),
    }),
  },
}
