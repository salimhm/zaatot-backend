import type { lib_dto_context } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { Elysia } from 'elysia'

import { lib_jwt } from '@lib/jwt.lib'

import { dto_contact } from '@module/tenant/contact/contact.dto'
import { service_contact } from '@module/tenant/contact/contact.service'

export const controller_contact = new Elysia({ prefix: '/contact' })
  .use(lib_jwt)

  .get(
    '/',
    async (context) => {
      const { query, payload } = context as lib_dto_context<{
        query: Static<typeof dto_contact.find.query>
      }> & typeof context

      return await service_contact.find(query, payload)
    },
    dto_contact.find,
  )

  .post(
    '/',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_contact.create.body>
      }> & typeof context

      return await service_contact.create(body, payload)
    },
    dto_contact.create,
  )

  .patch(
    '/',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_contact.update.body>
      }> & typeof context

      return await service_contact.update(body, payload)
    },
    dto_contact.update,
  )

  .delete(
    '/',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_contact.delete.body>
      }> & typeof context

      return await service_contact.delete(body, payload)
    },
    dto_contact.delete,
  )
