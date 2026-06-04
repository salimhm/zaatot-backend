import { t } from 'elysia'

import { lib_dto_find_query, lib_dto_find_response } from '@lib/dto.lib'
import { enum_tenant_type } from '@lib/enum.lib'

export const enum_tenant_columns = ['tenant_id', 'tenant_name', 'tenant_type', 'tenant_schema_version', 'created_at', 'user_id'] as const
export const enum_tenant_order_by = [...enum_tenant_columns, ...enum_tenant_columns.map((c) => `-${c}`)] as const

export const dto_schema_tenant = t.Object({
  tenant_id: t.Number(),
  tenant_type: t.UnionEnum(enum_tenant_type),
  tenant_schema_version: t.String(),
  tenant_name: t.String(),
  tenant_db_id: t.Union([t.String(), t.Null()]),
  tenant_db_url: t.Union([t.String(), t.Null()]),
  user_id: t.Number(),
  created_at: t.String(),
})

export const dto_tenant = {
  find: {
    query: t.Object({
      ...lib_dto_find_query,
      columns: t.Array(t.UnionEnum(enum_tenant_columns)),
      order_by: t.Optional(t.Array(t.UnionEnum(enum_tenant_order_by))),
      group_by: t.Optional(t.Array(t.UnionEnum(enum_tenant_columns))),
      tenant_id: t.Optional(t.Array(t.String())),
      tenant_name: t.Optional(t.Array(t.String())),
      tenant_type: t.Optional(t.Array(t.UnionEnum(enum_tenant_type))),
    }),
    response: t.Object({
      ...lib_dto_find_response,
      data: t.Array(t.Partial(dto_schema_tenant)),
    }),
  },
  create: {
    body: t.Object({
      tenant_name: t.String({ minLength: 1, maxLength: 128 }),
      tenant_type: t.UnionEnum(enum_tenant_type),
    }),
    response: t.Object({
      data: dto_schema_tenant,
      token: t.Optional(t.String()),
    }),
  },
  update: {
    body: t.Object({
      tenant_id: t.Number(),
      tenant_name: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
    }),
    response: t.Object({
      data: dto_schema_tenant,
    }),
  },
  delete: {
    body: t.Object({
      tenant_id: t.Number(),
    }),
    response: t.Object({
      data: dto_schema_tenant,
    }),
  },
}
