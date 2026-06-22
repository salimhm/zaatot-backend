import { t } from 'elysia'

import { lib_dto_find_query, lib_dto_find_response } from '@lib/dto.lib'
import { enum_user_list_type } from '@lib/enum.lib'

import { dto_schema_product } from '@module/main/product/product.dto'

export const enum_user_list_columns = ['user_list_id', 'product_id', 'user_list_type', 'created_at'] as const

export const enum_user_list_order_by = [...enum_user_list_columns, ...enum_user_list_columns.map((c) => `-${c}`)] as const

export const dto_schema_user_list = t.Object({
  user_list_id: t.Number(),
  product_id: t.Number(),
  user_list_type: t.UnionEnum(enum_user_list_type),
  created_at: t.String(),
  product: t.Union([dto_schema_product, t.Null()]),
})

export const dto_user_list = {
  find: {
    query: t.Object({
      ...lib_dto_find_query,
      columns: t.Array(t.UnionEnum(enum_user_list_columns)),
      order_by: t.Optional(t.Array(t.UnionEnum(enum_user_list_order_by))),
      group_by: t.Optional(t.Array(t.UnionEnum(enum_user_list_columns))),
      user_list_id: t.Optional(t.Array(t.Numeric())),
      product_id: t.Optional(t.Array(t.Numeric())),
      user_list_type: t.Optional(t.Array(t.UnionEnum(enum_user_list_type))),
    }),
    response: t.Object({
      ...lib_dto_find_response,
      data: t.Array(t.Partial(dto_schema_user_list)),
    }),
  },
  create: {
    body: t.Object({
      product_id: t.Number(),
      user_list_type: t.UnionEnum(enum_user_list_type),
    }),
    response: t.Object({
      data: dto_schema_user_list,
    }),
  },
  update: {
    body: t.Object({
      product_id: t.Number(),
      user_list_type: t.UnionEnum(enum_user_list_type),
    }),
    response: t.Object({
      data: dto_schema_user_list,
    }),
  },
  delete: {
    body: t.Object({
      product_id: t.Number(),
    }),
    response: t.Object({
      data: dto_schema_user_list,
    }),
  },
}
