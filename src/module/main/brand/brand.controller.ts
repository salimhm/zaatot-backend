import { Elysia } from 'elysia'

import { lib_jwt } from '@lib/jwt.lib'

import { dto_brand } from '@module/main/brand/brand.dto'
import { service_brand } from '@module/main/brand/brand.service'

export const controller_brand = new Elysia({ prefix: '/brand' })

  .use(lib_jwt)

  .get(
    '/',
    async (context) => {
      const { query } = context

      return await service_brand.find(query)
    },
    dto_brand.find,
  )

  .post(
    '/',
    async (context) => {
      const { body } = context

      return await service_brand.create(body)
    },
    dto_brand.create,
  )

  .put(
    '/',
    async (context) => {
      const { body } = context

      return await service_brand.update(body)
    },
    dto_brand.update,
  )

  .delete(
    '/',
    async (context) => {
      const { body } = context

      return await service_brand.delete(body)
    },
    dto_brand.delete,
  )
