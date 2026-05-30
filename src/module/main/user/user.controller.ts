import type { lib_dto_context } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { Elysia } from 'elysia'

import { lib_jwt } from '@lib/jwt.lib'

import { dto_user } from '@module/main/user/user.dto'
import { service_user } from '@module/main/user/user.service'

export const controller_user = new Elysia({ prefix: '/user' })
  .use(lib_jwt)

  .patch(
    '/',
    async (context) => {
      const { body, payload } = context as unknown as lib_dto_context<{
        body: Static<typeof dto_user.update.body>
      }>

      return await service_user.update(body, payload)
    },
    dto_user.update,
  )
