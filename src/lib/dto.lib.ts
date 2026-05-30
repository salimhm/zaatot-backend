import { t } from 'elysia'

export type lib_dto_payload = {
  user_id: number
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
  take: t.Optional(t.Numeric({ minimum: 1, maximum: 12 })),
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
