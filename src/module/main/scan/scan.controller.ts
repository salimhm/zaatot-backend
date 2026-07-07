import type { lib_dto_context } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { Elysia } from 'elysia'

import { lib_jwt } from '@lib/jwt.lib'

import { dto_scan } from '@module/main/scan/scan.dto'
import { service_scan } from '@module/main/scan/scan.service'

export const controller_scan = new Elysia({ prefix: '/scan' })
  .use(lib_jwt)

  .post(
    '/barcode',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_scan.barcode.body>
      }> &
        typeof context

      return await service_scan.scan_barcode(body, payload)
    },
    dto_scan.barcode,
  )

  .post(
    '/identify',
    async (context) => {
      const { body, payload } = context as lib_dto_context<{
        body: Static<typeof dto_scan.identify.body>
      }> &
        typeof context

      return await service_scan.identify(body, payload)
    },
    dto_scan.identify,
  )
