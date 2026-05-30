import type { lib_dto_context } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { Elysia } from 'elysia'

import { lib_jwt } from '@lib/jwt.lib'

import { dto_tenant } from '@module/main/tenant/tenant.dto'
import { service_tenant } from '@module/main/tenant/tenant.service'

export const controller_tenant = new Elysia({ prefix: '/tenant' })
  .use(lib_jwt)

  .get(
    '/',
    async (context) => {
      const { query, payload } = context as lib_dto_context<{
        query: Static<typeof dto_tenant.find.query>
      }> &
        typeof context
      return await service_tenant.find(query, payload)
    },
    dto_tenant.find,
  )

  .post(
    '/',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_tenant.create.body>
      }> &
        typeof context
      return await service_tenant.create(body, payload)
    },
    dto_tenant.create,
  )

  .patch(
    '/',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_tenant.update.body>
      }> &
        typeof context
      return await service_tenant.update(body, payload)
    },
    dto_tenant.update,
  )

  .delete(
    '/',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_tenant.delete.body>
      }> &
        typeof context
      return await service_tenant.delete(body, payload)
    },
    dto_tenant.delete,
  )
