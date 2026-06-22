import { t } from 'elysia'

import { lib_dto_find_query, lib_dto_find_response } from '@lib/dto.lib'
import { enum_ecoscore, enum_nova_group, enum_nutriscore, enum_product_type } from '@lib/enum.lib'

export const enum_product_columns = [
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
] as const

export const enum_product_order_by = [...enum_product_columns, ...enum_product_columns.map((c) => `-${c}`)] as const

export const dto_schema_product_metadata = t.Object({
  ingredients: t.Union([t.Array(t.String()), t.Null()]),
  allergens: t.Array(t.String()),
})

export const dto_schema_product = t.Object({
  product_id: t.Number(),
  product_barcode: t.String(),
  product_type: t.UnionEnum(enum_product_type),
  product_name: t.Union([t.String(), t.Null()]),
  brand_id: t.Union([t.Number(), t.Null()]),
  product_images: t.Union([t.Array(t.String()), t.Null()]),
  product_nova_group: t.Union([t.UnionEnum(enum_nova_group), t.Null()]),
  product_ecoscore: t.Union([t.UnionEnum(enum_ecoscore), t.Null()]),
  product_nutriscore: t.Union([t.UnionEnum(enum_nutriscore), t.Null()]),
  product_metadata: t.Union([dto_schema_product_metadata, t.Null()]),
  updated_at: t.String(),
  created_at: t.String(),
  brand_name: t.Union([t.String(), t.Null()]),
  brand_is_boycotted: t.Union([t.Boolean(), t.Null()]),
  brand_boycott_reasons: t.Union([t.Array(t.String()), t.Null()]),
  brand_boycott_alternatives: t.Union([t.Array(t.String()), t.Null()]),
})

export const dto_product = {
  find: {
    query: t.Object({
      ...lib_dto_find_query,
      columns: t.Array(t.UnionEnum(enum_product_columns)),
      order_by: t.Optional(t.Array(t.UnionEnum(enum_product_order_by))),
      group_by: t.Optional(t.Array(t.UnionEnum(enum_product_columns))),
      product_id: t.Optional(t.Array(t.Numeric())),
      product_barcode: t.Optional(t.Array(t.String())),
      product_type: t.Optional(t.Array(t.UnionEnum(enum_product_type))),
      product_name: t.Optional(t.Array(t.String())),
      brand_id: t.Optional(t.Array(t.Numeric())),
      product_nova_group: t.Optional(t.Array(t.UnionEnum(enum_nova_group))),
      product_ecoscore: t.Optional(t.Array(t.UnionEnum(enum_ecoscore))),
      product_nutriscore: t.Optional(t.Array(t.UnionEnum(enum_nutriscore))),
    }),
    response: t.Object({
      ...lib_dto_find_response,
      data: t.Array(t.Partial(dto_schema_product)),
    }),
  },
  create: {
    body: t.Object({
      product_barcode: t.String({ minLength: 6, maxLength: 64, pattern: '^\\d+$' }),
      product_type: t.UnionEnum(enum_product_type),
      product_name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
      brand_id: t.Optional(t.Number()),
      product_images: t.Optional(t.Array(t.String({ maxLength: 1024 }))),
      product_nova_group: t.Optional(t.Union([t.UnionEnum(enum_nova_group), t.Null()])),
      product_ecoscore: t.Optional(t.Union([t.UnionEnum(enum_ecoscore), t.Null()])),
      product_nutriscore: t.Optional(t.Union([t.UnionEnum(enum_nutriscore), t.Null()])),
      product_metadata: t.Optional(dto_schema_product_metadata),
    }),
    response: t.Object({
      data: dto_schema_product,
    }),
  },
  update: {
    body: t.Object({
      product_id: t.Number(),
      product_name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
      brand_id: t.Optional(t.Number()),
      product_images: t.Optional(t.Array(t.String({ maxLength: 1024 }))),
      product_nova_group: t.Optional(t.Union([t.UnionEnum(enum_nova_group), t.Null()])),
      product_ecoscore: t.Optional(t.Union([t.UnionEnum(enum_ecoscore), t.Null()])),
      product_nutriscore: t.Optional(t.Union([t.UnionEnum(enum_nutriscore), t.Null()])),
      product_metadata: t.Optional(dto_schema_product_metadata),
    }),
    response: t.Object({
      data: dto_schema_product,
    }),
  },
  delete: {
    body: t.Object({
      product_id: t.Number(),
    }),
    response: t.Object({
      data: dto_schema_product,
    }),
  },
}
