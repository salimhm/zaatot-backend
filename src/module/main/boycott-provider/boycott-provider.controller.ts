import { Elysia } from 'elysia'

import { lib_jwt } from '@lib/jwt.lib'

import { dto_boycott_provider } from '@module/main/boycott-provider/boycott-provider.dto'
import { service_boycott_provider } from '@module/main/boycott-provider/boycott-provider.service'

export const controller_boycott_provider = new Elysia({ prefix: '/boycott-provider' })

  .use(lib_jwt)

  .post(
    '/search',
    async (context) => {
      const { body } = context

      return await service_boycott_provider.search(body)
    },
    dto_boycott_provider.search,
  )

  .post(
    '/decide',
    async (context) => {
      const { body } = context

      return await service_boycott_provider.decide(body)
    },
    dto_boycott_provider.decide,
  )
