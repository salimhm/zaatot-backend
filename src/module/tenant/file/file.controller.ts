import { Elysia } from 'elysia'

import { check_rate_limit } from '@db/utils.db'

import { lib_jwt } from '@lib/jwt.lib'

import { dto_file } from '@module/tenant/file/file.dto'
import { service_file } from '@module/tenant/file/file.service'

export const controller_file = new Elysia({ prefix: '/file' })

  .use(lib_jwt)

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

      await check_rate_limit({ key: `rate:file:upload:${payload.user_id}`, limit: 20, duration: 60 })

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
