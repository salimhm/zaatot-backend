import { Elysia } from 'elysia'

import { lib_jwt } from '@lib/jwt.lib'

import { dto_auth } from '@module/main/auth/auth.dto'
import { service_auth } from '@module/main/auth/auth.service'

export const controller_auth = new Elysia({ prefix: '/auth' })

  .use(lib_jwt)

  .post(
    '/otp/send',
    async (context) => {
      const { body } = context as any
      return await service_auth.send_otp(body)
    },
    dto_auth.otp_send,
  )

  .post(
    '/otp/verify',
    async (context) => {
      const { body, jwt } = context as any
      return await service_auth.verify_otp(body, jwt)
    },
    dto_auth.otp_verify,
  )

  .onError((error) => ({ error }))
