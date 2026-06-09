import { t } from 'elysia'

import { enum_tenant_type } from '@lib/enum.lib'

export type lib_dto_tenant = {
  tenant_id: number
  tenant_type: (typeof enum_tenant_type)[number]
  tenant_schema_version: string
}

export type lib_dto_payload = {
  user_id: number
  tenants?: lib_dto_tenant[]
}

export type lib_dto_context<
  T extends {
    body?: unknown
    query?: unknown
    params?: unknown
  } = {},
> = {
  payload: lib_dto_payload
} & T

export const lib_dto_find_query = {
  page: t.Optional(t.Numeric({ minimum: 1 })),
  take: t.Optional(t.Numeric({ minimum: 1, maximum: Number(process.env.QUERY_TAKE_MAX) || 12 })),
  count: t.Optional(t.UnionEnum(['false', 'true'])),
  combination_type: t.Optional(t.UnionEnum(['AND', 'OR'])),
}

export const lib_dto_find_response = {
  rows: t.Union([t.Number(), t.Null()]),
  pages: t.Union([t.Number(), t.Null()]),
  page: t.Number(),
  take: t.Number(),
}

export const lib_dto_phone = t.String({
  minLength: 8,
  maxLength: 24,
  pattern: '^\\+\\d+$',
})
