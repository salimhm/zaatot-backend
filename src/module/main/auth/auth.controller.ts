import { Elysia } from 'elysia'

import { check_rate_limit, get_ip } from '@db/utils.db'

import { lib_jwt } from '@lib/jwt.lib'

import { dto_auth } from '@module/main/auth/auth.dto'
import { service_auth } from '@module/main/auth/auth.service'

export const controller_auth = new Elysia({ prefix: '/auth' })

  .use(lib_jwt)

  .post(
    '/otp/send',
    async (context) => {
      const { body, request, server } = context
      const ip = get_ip(request, server)
      const phone = body.user_phone

      await check_rate_limit({ key: `rate:otp:send:phone:${phone}`, limit: 3, duration: 300 })
      await check_rate_limit({ key: `rate:otp:send:ip:${ip}`, limit: 5, duration: 600 })

      return await service_auth.send_otp(body)
    },
    dto_auth.otp_send,
  )

  .post(
    '/otp/verify',
    async (context) => {
      const { body, jwt, request, server } = context
      const ip = get_ip(request, server)
      const phone = body.user_phone

      await check_rate_limit({ key: `rate:otp:verify:${phone}:${ip}`, limit: 5, duration: 300 })

      return await service_auth.verify_otp(body, jwt)
    },
    dto_auth.otp_verify,
  )
