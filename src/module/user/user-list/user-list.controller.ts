import type { lib_dto_context } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { Elysia } from 'elysia'

import { lib_jwt } from '@lib/jwt.lib'

import { dto_user_list } from '@module/user/user-list/user-list.dto'
import { service_user_list } from '@module/user/user-list/user-list.service'

export const controller_user_list = new Elysia({ prefix: '/user-list' })
  .use(lib_jwt)

  .get(
    '/',
    async (context) => {
      const { query, payload } = context as lib_dto_context<{
        query: Static<typeof dto_user_list.find.query>
      }> &
        typeof context

      return await service_user_list.find(query, payload)
    },
    dto_user_list.find,
  )

  .post(
    '/',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_user_list.create.body>
      }> &
        typeof context

      return await service_user_list.create(body, payload)
    },
    dto_user_list.create,
  )

  .patch(
    '/',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_user_list.update.body>
      }> &
        typeof context

      return await service_user_list.update(body, payload)
    },
    dto_user_list.update,
  )

  .delete(
    '/',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_user_list.delete.body>
      }> &
        typeof context

      return await service_user_list.delete(body, payload)
    },
    dto_user_list.delete,
  )
