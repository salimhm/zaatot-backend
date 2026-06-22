import { t } from 'elysia'

import { enum_scan_source } from '@lib/enum.lib'

import { dto_schema_product } from '@module/main/product/product.dto'

export const dto_scan = {
  barcode: {
    body: t.Object({
      barcode: t.String({ minLength: 6, maxLength: 64, pattern: '^\\d+$' }),
    }),
    response: t.Object({
      data: t.Object({
        product: t.Union([dto_schema_product, t.Null()]),
        source: t.UnionEnum(enum_scan_source),
      }),
    }),
  },
}
