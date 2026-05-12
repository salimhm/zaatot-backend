import { Elysia } from 'elysia'

import jwt from '@elysiajs/jwt'

import { dto_contact } from '@module/tenant/contact/contact.dto'
import { service_contact } from '@module/tenant/contact/contact.service'

export const controller_contact = new Elysia({ prefix: '/contact' })

  .use(
    jwt({
      secret: process.env.JWT_SECRET_KEY!,
    }),
  )

  .get(
    '/',
    async (context) => {
      const { query, payload } = context as any

      return await service_contact.find(query, payload)
    },
    dto_contact.find,
  )

  .post(
    '/',
    async (context) => {
      const { body, payload } = context as any

      return await service_contact.create(body, payload)
    },
    dto_contact.create,
  )

  .patch(
    '/',
    async (context) => {
      const { body, payload } = context as any

      return await service_contact.update(body, payload)
    },
    dto_contact.update,
  )

  .delete(
    '/',
    async (context) => {
      const { body, payload } = context as any

      return await service_contact.delete(body, payload)
    },
    dto_contact.delete,
  )

  .onError((error) => ({ error }))
