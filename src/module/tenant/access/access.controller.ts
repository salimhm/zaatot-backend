import type { lib_dto_context } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { Elysia } from 'elysia'

import { lib_jwt } from '@lib/jwt.lib'

import { dto_access } from '@module/tenant/access/access.dto'
import { service_access } from '@module/tenant/access/access.service'

export const controller_access = new Elysia({ prefix: '/access' })
  .use(lib_jwt)

  .get(
    '/',
    async (context) => {
      const { query, payload } = context as lib_dto_context<{
        query: Static<typeof dto_access.find.query>
      }> &
        typeof context

      return await service_access.find(query, payload)
    },
    dto_access.find,
  )

  .post(
    '/',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_access.create.body>
      }> &
        typeof context

      return await service_access.create(body, payload)
    },
    dto_access.create,
  )

  .patch(
    '/',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_access.update.body>
      }> &
        typeof context

      return await service_access.update(body, payload)
    },
    dto_access.update,
  )

  .delete(
    '/',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_access.delete.body>
      }> &
        typeof context

      return await service_access.delete(body, payload)
    },
    dto_access.delete,
  )
