import { t } from 'elysia'

import { lib_dto_find_query, lib_dto_find_response, lib_dto_phone } from '@lib/dto.lib'

export const enum_user_columns = ['user_id', 'user_phone', 'user_first_name', 'user_last_name', 'created_at'] as const
export const enum_user_order_by = [...enum_user_columns, ...enum_user_columns.map((c) => `-${c}`)] as const

export const dto_user = {
  find: {
    query: t.Object({
      ...lib_dto_find_query,
      columns: t.Array(t.UnionEnum(enum_user_columns)),
      order_by: t.Optional(t.Array(t.UnionEnum(enum_user_order_by))),
      group_by: t.Optional(t.Array(t.UnionEnum(enum_user_columns))),
      user_id: t.Optional(t.Array(t.String())),
      user_phone: t.Optional(t.Array(lib_dto_phone)),
      user_last_name: t.Optional(t.Array(t.String())),
      user_first_name: t.Optional(t.Array(t.String())),
    }),
    response: t.Object({
      ...lib_dto_find_response,
    }),
  },
  create: {
    body: t.Object({
      user_first_name: t.String({ minLength: 1, maxLength: 32 }),
      user_last_name: t.String({ minLength: 1, maxLength: 32 }),
      user_phone: lib_dto_phone,
      user_image: t.Optional(t.String({ minLength: 1, maxLength: 32 })),
    }),
    response: t.Object({
      data: t.Any(),
    }),
  },
  update: {
    body: t.Object({
      user_first_name: t.Optional(t.String({ minLength: 1, maxLength: 32 })),
      user_last_name: t.Optional(t.String({ minLength: 1, maxLength: 32 })),
      user_phone: t.Optional(lib_dto_phone),
      user_image: t.Optional(t.String({ minLength: 1, maxLength: 32 })),
    }),
    response: t.Object({
      data: t.Any(),
    }),
  },
  delete: {
    body: t.Object({}),
    response: t.Object({
      data: t.Any(),
    }),
  },
}
