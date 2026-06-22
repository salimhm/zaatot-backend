import { t } from 'elysia'

import { lib_dto_find_query, lib_dto_find_response } from '@lib/dto.lib'

import { dto_schema_product } from '@module/main/product/product.dto'

export const enum_scan_history_columns = ['scan_history_id', 'product_id', 'product_barcode', 'scanned_at'] as const

export const enum_scan_history_order_by = [...enum_scan_history_columns, ...enum_scan_history_columns.map((c) => `-${c}`)] as const

export const dto_schema_scan_history = t.Object({
  scan_history_id: t.Number(),
  product_id: t.Number(),
  product_barcode: t.String(),
  scanned_at: t.String(),
  product: t.Union([dto_schema_product, t.Null()]),
})

export const dto_scan_history = {
  find: {
    query: t.Object({
      ...lib_dto_find_query,
      columns: t.Array(t.UnionEnum(enum_scan_history_columns)),
      order_by: t.Optional(t.Array(t.UnionEnum(enum_scan_history_order_by))),
      group_by: t.Optional(t.Array(t.UnionEnum(enum_scan_history_columns))),
      scan_history_id: t.Optional(t.Array(t.Numeric())),
      product_id: t.Optional(t.Array(t.Numeric())),
      product_barcode: t.Optional(t.Array(t.String())),
    }),
    response: t.Object({
      ...lib_dto_find_response,
      data: t.Array(t.Partial(dto_schema_scan_history)),
    }),
  },
}
