import { Elysia } from 'elysia'

import jwt from '@elysiajs/jwt'

import { dto_user } from '@module/main/user/user.dto'
import { service_user } from '@module/main/user/user.service'

export const controller_user = new Elysia({ prefix: '/user' })

  .use(
    jwt({
      secret: process.env.JWT_SECRET_KEY!,
    }),
  )

  .patch(
    '/',
    async (context) => {
      const { body, payload } = context as any

      return await service_user.update(body, payload)
    },
    dto_user.update,
  )

  .onError((error) => ({ error }))
