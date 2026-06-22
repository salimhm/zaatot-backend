import type { lib_dto_context } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { Elysia } from 'elysia'

import { lib_jwt } from '@lib/jwt.lib'

import { dto_product } from '@module/main/product/product.dto'
import { service_product } from '@module/main/product/product.service'

export const controller_product = new Elysia({ prefix: '/product' })
  .use(lib_jwt)

  .get(
    '/',
    async (context) => {
      const { query } = context as lib_dto_context<{
        query: Static<typeof dto_product.find.query>
      }> &
        typeof context

      return await service_product.find(query)
    },
    dto_product.find,
  )

  .post(
    '/',
    async (context) => {
      const { body } = context as lib_dto_context<{
        body: Static<typeof dto_product.create.body>
      }> &
        typeof context

      return await service_product.create(body)
    },
    dto_product.create,
  )

  .patch(
    '/',
    async (context) => {
      const { body } = context as lib_dto_context<{
        body: Static<typeof dto_product.update.body>
      }> &
        typeof context

      return await service_product.update(body)
    },
    dto_product.update,
  )

  .delete(
    '/',
    async (context) => {
      const { body } = context as lib_dto_context<{
        body: Static<typeof dto_product.delete.body>
      }> &
        typeof context

      return await service_product.delete(body)
    },
    dto_product.delete,
  )
