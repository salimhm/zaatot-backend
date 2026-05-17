import { Elysia } from 'elysia'

import { lib_jwt } from '@lib/jwt.lib'

import { dto_tenant } from '@module/main/tenant/tenant.dto'
import { service_tenant } from '@module/main/tenant/tenant.service'

export const controller_tenant = new Elysia({ prefix: '/tenant' })
  .use(lib_jwt)

  .get(
    '/',
    async (context) => {
      const { query, payload } = context as any
      return await service_tenant.find(query, payload)
    },
    dto_tenant.find,
  )

  .post(
    '/',
    async (context) => {
      const { body, payload } = context as any
      return await service_tenant.create(body, payload)
    },
    dto_tenant.create,
  )

  .put(
    '/',
    async (context) => {
      const { body, payload } = context as any
      return await service_tenant.update(body, payload)
    },
    dto_tenant.update,
  )

  .delete(
    '/',
    async (context) => {
      const { body, payload } = context as any
      return await service_tenant.delete(body, payload)
    },
    dto_tenant.delete,
  )
