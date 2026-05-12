import { Elysia } from 'elysia'

import jwt from '@elysiajs/jwt'

import { dto_file } from '@module/tenant/file/file.dto'
import { service_file } from '@module/tenant/file/file.service'

export const controller_file = new Elysia({ prefix: '/file' })

  .use(
    jwt({
      secret: process.env.JWT_SECRET_KEY!,
    }),
  )

  .get(
    '/',
    async (context) => {
      const { query, payload } = context as any

      return await service_file.find(query, payload)
    },
    dto_file.find,
  )

  .post(
    '/',
    async (context) => {
      const { body, payload } = context as any

      return await service_file.create(body, payload)
    },
    dto_file.create,
  )

  .patch(
    '/',
    async (context) => {
      const { body, payload } = context as any

      return await service_file.update(body, payload)
    },
    dto_file.update,
  )

  .delete(
    '/',
    async (context) => {
      const { body, payload } = context as any

      return await service_file.delete(body, payload)
    },
    dto_file.delete,
  )

  .onError((error) => ({ error }))
