import { t } from 'elysia'

import { lib_dto_find_query, lib_dto_find_response } from '@lib/dto.lib'
import { enum_access_action } from '@lib/enum.lib'

export const enum_access_columns = ['access_id', 'user_id', 'actions', 'created_at'] as const
export const enum_access_order_by = [...enum_access_columns, ...enum_access_columns.map((c) => `-${c}`)] as const

export const dto_schema_access = t.Object({
  access_id: t.Number(),
  user_id: t.Number(),
  actions: t.Array(t.UnionEnum(enum_access_action)),
  created_at: t.String(),
})

export const dto_access = {
  find: {
    query: t.Object({
      ...lib_dto_find_query,
      columns: t.Array(t.UnionEnum(enum_access_columns)),
      order_by: t.Optional(t.Array(t.UnionEnum(enum_access_order_by))),
      group_by: t.Optional(t.Array(t.UnionEnum(enum_access_columns))),
      tenant_id: t.Numeric(),
      user_id: t.Optional(t.Array(t.Numeric())),
    }),
    response: t.Object({
      ...lib_dto_find_response,
      data: t.Array(t.Partial(dto_schema_access)),
    }),
  },
  create: {
    body: t.Object({
      tenant_id: t.Numeric(),
      user_id: t.Numeric(),
      actions: t.Array(t.UnionEnum(enum_access_action)),
    }),
    response: t.Object({
      data: dto_schema_access,
    }),
  },
  update: {
    body: t.Object({
      tenant_id: t.Numeric(),
      user_id: t.Numeric(),
      actions: t.Array(t.UnionEnum(enum_access_action)),
    }),
    response: t.Object({
      data: dto_schema_access,
    }),
  },
  delete: {
    body: t.Object({
      tenant_id: t.Numeric(),
      user_id: t.Numeric(),
    }),
    response: t.Object({
      data: dto_schema_access,
    }),
  },
  check_tenant: {
    body: t.Object({
      tenant_id: t.Numeric(),
    }),
    response: t.Object({
      data: dto_schema_access,
    }),
  },
}
