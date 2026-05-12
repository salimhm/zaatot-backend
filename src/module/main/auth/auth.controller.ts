import { Elysia } from 'elysia'

import jwt from '@elysiajs/jwt'

import { dto_auth } from '@module/main/auth/auth.dto'
import { service_auth } from '@module/main/auth/auth.service'

export const controller_auth = new Elysia({ prefix: '/auth' })

  .use(
    jwt({
      secret: process.env.JWT_SECRET_KEY!,
    }),
  )

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
