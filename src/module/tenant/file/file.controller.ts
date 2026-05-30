import type { lib_dto_context } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { Elysia } from 'elysia'

import { lib_jwt } from '@lib/jwt.lib'

import { dto_file } from '@module/tenant/file/file.dto'
import { service_file } from '@module/tenant/file/file.service'

export const controller_file = new Elysia({ prefix: '/file' })
  .use(lib_jwt)

  .get(
    '/',
    async (context) => {
      const { query, payload } = context as lib_dto_context<{
        query: Static<typeof dto_file.find.query>
      }> & typeof context

      return await service_file.find(query, payload)
    },
    dto_file.find,
  )

  .post(
    '/',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_file.create.body>
      }> & typeof context
      return await service_file.create(body, payload)
    },
    dto_file.create,
  )

  .patch(
    '/',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_file.update.body>
      }> & typeof context

      return await service_file.update(body, payload)
    },
    dto_file.update,
  )

  .delete(
    '/',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_file.delete.body>
      }> & typeof context

      return await service_file.delete(body, payload)
    },
    dto_file.delete,
  )
