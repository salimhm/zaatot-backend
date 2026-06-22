import type { lib_dto_context } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { Elysia } from 'elysia'

import { lib_jwt } from '@lib/jwt.lib'

import { dto_scan_history } from '@module/user/scan-history/scan-history.dto'
import { service_scan_history } from '@module/user/scan-history/scan-history.service'

export const controller_scan_history = new Elysia({ prefix: '/scan-history' })
  .use(lib_jwt)

  .get(
    '/',
    async (context) => {
      const { query, payload } = context as lib_dto_context<{
        query: Static<typeof dto_scan_history.find.query>
      }> &
        typeof context

      return await service_scan_history.find(query, payload)
    },
    dto_scan_history.find,
  )
