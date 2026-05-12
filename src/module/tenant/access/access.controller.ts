import { Elysia } from 'elysia'

import jwt from '@elysiajs/jwt'

import { dto_access } from '@module/tenant/access/access.dto'
import { service_access } from '@module/tenant/access/access.service'

export const controller_access = new Elysia({ prefix: '/access' })

  .use(
    jwt({
      secret: process.env.JWT_SECRET_KEY!,
    }),
  )

  .get(
    '/',
    async (context) => {
      const { query, payload } = context as any

      return await service_access.find(query, payload)
    },
    dto_access.find,
  )

  .post(
    '/',
    async (context) => {
      const { body, payload } = context as any

      return await service_access.create(body, payload)
    },
    dto_access.create,
  )

  .patch(
    '/',
    async (context) => {
      const { body, payload } = context as any

      return await service_access.update(body, payload)
    },
    dto_access.update,
  )

  .delete(
    '/',
    async (context) => {
      const { body, payload } = context as any

      return await service_access.delete(body, payload)
    },
    dto_access.delete,
  )

  .onError((error) => ({ error }))
