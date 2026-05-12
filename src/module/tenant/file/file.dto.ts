import { t } from 'elysia'

import { lib_dto_find_query, lib_dto_find_response } from '@lib/dto.lib'

export const enum_file_columns = ['file_id', 'file_name', 'user_id', 'created_at'] as const
export const enum_file_order_by = [...enum_file_columns, ...enum_file_columns.map((c) => `-${c}`)] as const

export const dto_file = {
  find: {
    query: t.Object({
      ...lib_dto_find_query,
      columns: t.Array(t.UnionEnum(enum_file_columns)),
      order_by: t.Optional(t.Array(t.UnionEnum(enum_file_order_by))),
      group_by: t.Optional(t.Array(t.UnionEnum(enum_file_columns))),
      tenant_id: t.Numeric(),
      file_id: t.Optional(t.Array(t.String())),
      file_name: t.Optional(t.Array(t.String())),
    }),
    response: t.Object({
      ...lib_dto_find_response,
    }),
  },
  create: {
    body: t.Object({
      tenant_id: t.Numeric(),
      file: t.File({ format: 'image/*,video/*,audio/*' }),
      file_name: t.Optional(t.String({ maxLength: 127 })),
    }),
    response: t.Object({
      data: t.Any(),
    }),
  },
  update: {
    body: t.Object({
      tenant_id: t.Numeric(),
      file_id: t.String({ minLength: 1, maxLength: 64 }),
      file_name: t.Optional(t.String({ maxLength: 127 })),
    }),
    response: t.Object({
      data: t.Any(),
    }),
  },
  delete: {
    body: t.Object({
      tenant_id: t.Numeric(),
      file_id: t.String({ minLength: 1, maxLength: 64 }),
    }),
    response: t.Object({
      data: t.Any(),
    }),
  },
}
