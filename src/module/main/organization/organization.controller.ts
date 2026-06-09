import type { lib_dto_context } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { Elysia } from 'elysia'

import { lib_jwt } from '@lib/jwt.lib'

import { dto_organization } from '@module/main/organization/organization.dto'
import { service_organization } from '@module/main/organization/organization.service'

export const controller_organization = new Elysia({ prefix: '/organization' })
  .use(lib_jwt)

  .get(
    '/',
    async (context) => {
      const { query, payload } = context as lib_dto_context<{
        query: Static<typeof dto_organization.find.query>
      }> &
        typeof context
      return await service_organization.find(query, payload)
    },
    dto_organization.find,
  )

  .post(
    '/',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_organization.create.body>
      }> &
        typeof context
      return await service_organization.create(body, payload)
    },
    dto_organization.create,
  )

  .patch(
    '/',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_organization.update.body>
      }> &
        typeof context
      return await service_organization.update(body, payload)
    },
    dto_organization.update,
  )

  .delete(
    '/',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_organization.delete.body>
      }> &
        typeof context
      return await service_organization.delete(body, payload)
    },
    dto_organization.delete,
  )
