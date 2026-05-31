import { t } from 'elysia'

import { lib_dto_find_query, lib_dto_find_response } from '@lib/dto.lib'

export const enum_file_columns = ['file_id', 'file_name', 'user_id', 'created_at'] as const
export const enum_file_order_by = [...enum_file_columns, ...enum_file_columns.map((c) => `-${c}`)] as const

export const dto_schema_file = t.Object({
  file_id: t.String(),
  file_name: t.Union([t.String(), t.Null()]),
  user_id: t.Number(),
  created_at: t.String(),
})

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
      data: t.Array(t.Partial(dto_schema_file)),
    }),
  },
  create: {
    body: t.Object({
      tenant_id: t.Numeric(),
      file_name: t.String({ maxLength: 127 }),
      file_type: t.String(),
      file_size: t.Number(),
    }),
    response: t.Object({
      upload_url: t.String(),
      data: dto_schema_file,
    }),
  },
  update: {
    body: t.Object({
      tenant_id: t.Numeric(),
      file_id: t.String({ minLength: 1, maxLength: 64 }),
      file_name: t.Optional(t.String({ maxLength: 127 })),
    }),
    response: t.Object({
      data: dto_schema_file,
    }),
  },
  delete: {
    body: t.Object({
      tenant_id: t.Numeric(),
      file_id: t.String({ minLength: 1, maxLength: 64 }),
    }),
    response: t.Object({
      data: dto_schema_file,
    }),
  },
}
