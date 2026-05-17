import { t } from 'elysia'

import { lib_dto_phone } from '@lib/dto.lib'
import { enum_otp_action } from '@lib/enum.lib'

export const dto_auth = {
  otp_send: {
    body: t.Object({
      user_phone: lib_dto_phone,
      otp_action: t.UnionEnum(enum_otp_action),
    }),
    response: t.Object({
      success: t.Boolean(),
    }),
  },
  otp_verify: {
    body: t.Object({
      user_phone: lib_dto_phone,
      otp_code: t.String({ minLength: 4, maxLength: 4 }),
      user_first_name: t.Optional(t.String({ minLength: 1, maxLength: 32 })),
      user_last_name: t.Optional(t.String({ minLength: 1, maxLength: 32 })),
    }),
    response: t.Object({
      data: t.Any(),
      token: t.String(),
    }),
  },
}
