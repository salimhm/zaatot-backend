import { Elysia } from 'elysia'

import { lib_jwt } from '@lib/jwt.lib'

import { dto_boycott_decision } from '@module/main/boycott-decision/boycott-decision.dto'
import { service_boycott_decision } from '@module/main/boycott-decision/boycott-decision.service'

export const controller_boycott_decision = new Elysia({ prefix: '/boycott-decision' })

  .use(lib_jwt)

  .post(
    '/decide',
    async (context) => {
      const { body } = context

      return await service_boycott_decision.decide(body)
    },
    dto_boycott_decision.decide,
  )
