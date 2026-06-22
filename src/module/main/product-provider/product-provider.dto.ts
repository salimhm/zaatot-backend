import { t } from 'elysia'

import { enum_ecoscore, enum_nova_group, enum_nutriscore } from '@lib/enum.lib'

import { dto_schema_product_metadata } from '@module/main/product/product.dto'

export const dto_schema_product_provider = t.Object({
  product_barcode: t.String(),
  product_type: t.String(),
  product_name: t.Union([t.String(), t.Null()]),
  product_brand_name: t.Union([t.String(), t.Null()]),
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
}
