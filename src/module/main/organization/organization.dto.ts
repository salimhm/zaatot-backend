import { t } from 'elysia'

import { lib_dto_find_query, lib_dto_find_response } from '@lib/dto.lib'

export const enum_organization_columns = ['organization_id', 'organization_name', 'organization_schema_version', 'created_at', 'user_id'] as const

export const enum_organization_order_by = [...enum_organization_columns, ...enum_organization_columns.map((c) => `-${c}`)] as const

export const dto_schema_organization = t.Object({
  organization_id: t.Number(),
  organization_name: t.String(),
  organization_schema_version: t.String(),
  organization_db_id: t.Union([t.String(), t.Null()]),
  organization_db_url: t.Union([t.String(), t.Null()]),
  user_id: t.Number(),
  created_at: t.String(),
})

export const dto_organization = {
  find: {
    query: t.Object({
      ...lib_dto_find_query,
      columns: t.Array(t.UnionEnum(enum_organization_columns)),
      order_by: t.Optional(t.Array(t.UnionEnum(enum_organization_order_by))),
      group_by: t.Optional(t.Array(t.UnionEnum(enum_organization_columns))),
      organization_id: t.Optional(t.Array(t.String())),
      organization_name: t.Optional(t.Array(t.String())),
    }),
    response: t.Object({
      ...lib_dto_find_response,
      data: t.Array(t.Partial(dto_schema_organization)),
    }),
  },
  create: {
    body: t.Object({
      organization_name: t.String({ minLength: 1, maxLength: 128 }),
    }),
    response: t.Object({
      data: dto_schema_organization,
    }),
  },
  update: {
    body: t.Object({
      organization_id: t.Number(),
      organization_name: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
    }),
    response: t.Object({
      data: dto_schema_organization,
    }),
  },
  delete: {
    body: t.Object({
      organization_id: t.Number(),
    }),
    response: t.Object({
      data: dto_schema_organization,
    }),
  },
}
