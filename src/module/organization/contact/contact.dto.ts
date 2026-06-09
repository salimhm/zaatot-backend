import { t } from 'elysia'

import { lib_dto_find_query, lib_dto_find_response, lib_dto_phone } from '@lib/dto.lib'
import { enum_country, enum_gender, enum_morocco_city } from '@lib/enum.lib'

export const enum_contact_columns = [
  'contact_id',
  'contact_name',
  'contact_gender',
  'contact_birthday',
  'contact_national_id',
  'contact_passport_id',
  'contact_address',
  'contact_city',
  'contact_country',
  'contact_nationality',
  'contact_metadata',
  'contact_phone',
  'contact_status',
  'created_at',
] as const
export const enum_contact_order_by = [...enum_contact_columns, ...enum_contact_columns.map((c) => `-${c}`)] as const

export const dto_schema_contact = t.Object({
  contact_id: t.Number(),
  contact_phone: lib_dto_phone,
  contact_name: t.Union([t.String(), t.Null()]),
  contact_gender: t.Union([t.UnionEnum(enum_gender), t.Null()]),
  contact_birthday: t.Union([t.String(), t.Null()]),
  contact_national_id: t.Union([t.String(), t.Null()]),
  contact_passport_id: t.Union([t.String(), t.Null()]),
  contact_address: t.Union([t.String(), t.Null()]),
  contact_city: t.Union([t.UnionEnum(enum_morocco_city), t.Null()]),
  contact_country: t.Union([t.UnionEnum(enum_country), t.Null()]),
  contact_nationality: t.Union([t.UnionEnum(enum_country), t.Null()]),
  contact_metadata: t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
  contact_status: t.Number(),
  created_at: t.String(),
})

export const dto_contact = {
  find: {
    query: t.Object({
      ...lib_dto_find_query,
      columns: t.Array(t.UnionEnum(enum_contact_columns)),
      order_by: t.Optional(t.Array(t.UnionEnum(enum_contact_order_by))),
      group_by: t.Optional(t.Array(t.UnionEnum(enum_contact_columns))),
      tenant_id: t.Numeric(),
      contact_id: t.Optional(t.Array(t.Numeric())),
      contact_phone: t.Optional(t.Array(lib_dto_phone)),
      contact_name: t.Optional(t.Array(t.String())),
      contact_status: t.Optional(t.Array(t.Integer())),
    }),
    response: t.Object({
      ...lib_dto_find_response,
      data: t.Array(t.Partial(dto_schema_contact)),
    }),
  },
  create: {
    body: t.Object({
      tenant_id: t.Numeric(),
      contact_phone: lib_dto_phone,
      contact_name: t.Optional(t.String({ minLength: 1, maxLength: 127 })),
      contact_gender: t.Optional(t.UnionEnum(enum_gender)),
      contact_birthday: t.Optional(t.String()),
      contact_national_id: t.Optional(t.String()),
      contact_passport_id: t.Optional(t.String()),
      contact_address: t.Optional(t.String()),
      contact_city: t.Optional(t.UnionEnum(enum_morocco_city)),
      contact_country: t.Optional(t.UnionEnum(enum_country)),
      contact_nationality: t.Optional(t.UnionEnum(enum_country)),
      contact_metadata: t.Optional(t.Union([t.Record(t.String(), t.Unknown()), t.Null()])),
      contact_status: t.Optional(t.Integer({ minimum: 0, maximum: 1 })),
    }),
    response: t.Object({
      data: dto_schema_contact,
    }),
  },
  update: {
    body: t.Object({
      tenant_id: t.Numeric(),
      contact_id: t.Numeric(),
      contact_phone: t.Optional(lib_dto_phone),
      contact_name: t.Optional(t.String({ minLength: 1, maxLength: 127 })),
      contact_gender: t.Optional(t.UnionEnum(enum_gender)),
      contact_birthday: t.Optional(t.String()),
      contact_national_id: t.Optional(t.String()),
      contact_passport_id: t.Optional(t.String()),
      contact_address: t.Optional(t.String()),
      contact_city: t.Optional(t.UnionEnum(enum_morocco_city)),
      contact_country: t.Optional(t.UnionEnum(enum_country)),
      contact_nationality: t.Optional(t.UnionEnum(enum_country)),
      contact_metadata: t.Optional(t.Union([t.Record(t.String(), t.Unknown()), t.Null()])),
      contact_status: t.Optional(t.Integer({ minimum: 0, maximum: 1 })),
    }),
    response: t.Object({
      data: dto_schema_contact,
    }),
  },
  delete: {
    body: t.Object({
      tenant_id: t.Numeric(),
      contact_id: t.Numeric(),
    }),
    response: t.Object({
      data: dto_schema_contact,
    }),
  },
}
