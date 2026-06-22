import { t } from 'elysia'

import { lib_dto_find_query, lib_dto_find_response } from '@lib/dto.lib'

export const enum_brand_columns = [
  'brand_id',
  'brand_name',
  'brand_is_boycotted',
  'brand_boycott_reasons',
  'brand_boycott_alternatives',
  'created_at',
] as const

export const enum_brand_order_by = [...enum_brand_columns, ...enum_brand_columns.map((c) => `-${c}`)] as const

export const dto_schema_brand = t.Object({
  brand_id: t.Number(),
  brand_name: t.String(),
  brand_is_boycotted: t.Boolean(),
  brand_boycott_reasons: t.Union([t.Array(t.String()), t.Null()]),
  brand_boycott_alternatives: t.Union([t.Array(t.String()), t.Null()]),
  created_at: t.String(),
})

export const dto_brand = {
  find: {
    query: t.Object({
      ...lib_dto_find_query,
      columns: t.Array(t.UnionEnum(enum_brand_columns)),
      order_by: t.Optional(t.Array(t.UnionEnum(enum_brand_order_by))),
      group_by: t.Optional(t.Array(t.UnionEnum(enum_brand_columns))),
      brand_id: t.Optional(t.Array(t.Numeric())),
      brand_name: t.Optional(t.Array(t.String())),
      brand_is_boycotted: t.Optional(t.Array(t.Boolean())),
    }),
    response: t.Object({
      ...lib_dto_find_response,
      data: t.Array(t.Partial(dto_schema_brand)),
    }),
  },
  create: {
    body: t.Object({
      brand_name: t.String({ minLength: 1, maxLength: 255 }),
      brand_is_boycotted: t.Optional(t.Boolean()),
      brand_boycott_reasons: t.Optional(t.Array(t.String())),
      brand_boycott_alternatives: t.Optional(t.Array(t.String())),
    }),
    response: t.Object({
      data: dto_schema_brand,
    }),
  },
  update: {
    body: t.Object({
      brand_id: t.Number(),
      brand_name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
      brand_is_boycotted: t.Optional(t.Boolean()),
      brand_boycott_reasons: t.Optional(t.Array(t.String())),
      brand_boycott_alternatives: t.Optional(t.Array(t.String())),
    }),
    response: t.Object({
      data: dto_schema_brand,
    }),
  },
  delete: {
    body: t.Object({
      brand_id: t.Number(),
    }),
    response: t.Object({
      data: dto_schema_brand,
    }),
  },
}
