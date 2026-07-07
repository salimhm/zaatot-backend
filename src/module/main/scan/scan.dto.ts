import { t } from 'elysia'

import { enum_scan_source } from '@lib/enum.lib'

import { dto_schema_boycott_provider_decision, dto_schema_boycott_provider_search } from '@module/main/boycott-provider/boycott-provider.dto'
import { dto_schema_product } from '@module/main/product/product.dto'

export const enum_scan_identify_type = ['barcode', 'url', 'text', 'unknown'] as const

export const enum_scan_boycott_source = ['provider', 'search', 'not_requested', 'unavailable'] as const

export const dto_schema_scan_identify = t.Object({
  scan_type: t.UnionEnum(enum_scan_identify_type),
  raw_value: t.String(),
  barcode: t.Union([t.String(), t.Null()]),
  query: t.Union([t.String(), t.Null()]),
})

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
  identify: {
    body: t.Object({
      scan_value: t.String({ minLength: 1, maxLength: 2048 }),
    }),
    response: t.Object({
      data: t.Object({
        scan: dto_schema_scan_identify,
        product: t.Union([dto_schema_product, t.Null()]),
        boycott_decision: t.Union([dto_schema_boycott_provider_decision, t.Null()]),
        boycott_search: t.Union([dto_schema_boycott_provider_search, t.Null()]),
        source: t.Object({
          product: t.Union([t.UnionEnum(enum_scan_source), t.Null()]),
          boycott: t.UnionEnum(enum_scan_boycott_source),
        }),
      }),
    }),
  },
}
