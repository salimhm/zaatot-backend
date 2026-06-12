import { Elysia } from 'elysia'

import { lib_jwt } from '@lib/jwt.lib'
import { check_rate_limit, get_ip } from '@lib/middleware.lib'

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

      const send_phone_limit = Number(process.env.RATE_LIMIT_OTP_SEND_PHONE_LIMIT) || 3
      const send_phone_duration = Number(process.env.RATE_LIMIT_OTP_SEND_PHONE_DURATION) || 300
      await check_rate_limit({ key: `rate:otp:send:phone:${phone}`, limit: send_phone_limit, duration: send_phone_duration })

      const send_phone_daily_limit = Number(process.env.RATE_LIMIT_OTP_SEND_PHONE_DAILY_LIMIT) || 12
      const send_phone_daily_duration = Number(process.env.RATE_LIMIT_OTP_SEND_PHONE_DAILY_DURATION) || 86400
      await check_rate_limit({ key: `rate:otp:send:phone:daily:${phone}`, limit: send_phone_daily_limit, duration: send_phone_daily_duration })

      const send_ip_limit = Number(process.env.RATE_LIMIT_OTP_SEND_IP_LIMIT) || 6
      const send_ip_duration = Number(process.env.RATE_LIMIT_OTP_SEND_IP_DURATION) || 600
      await check_rate_limit({ key: `rate:otp:send:ip:${ip}`, limit: send_ip_limit, duration: send_ip_duration })

      const send_ip_daily_limit = Number(process.env.RATE_LIMIT_OTP_SEND_IP_DAILY_LIMIT) || 24
      const send_ip_daily_duration = Number(process.env.RATE_LIMIT_OTP_SEND_IP_DAILY_DURATION) || 86400
      await check_rate_limit({ key: `rate:otp:send:ip:daily:${ip}`, limit: send_ip_daily_limit, duration: send_ip_daily_duration })

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

      const verify_limit = Number(process.env.RATE_LIMIT_OTP_VERIFY_LIMIT) || 5
      const verify_duration = Number(process.env.RATE_LIMIT_OTP_VERIFY_DURATION) || 300
      await check_rate_limit({ key: `rate:otp:verify:${phone}:${ip}`, limit: verify_limit, duration: verify_duration })

      const verify_daily_limit = Number(process.env.RATE_LIMIT_OTP_VERIFY_DAILY_LIMIT) || 30
      const verify_daily_duration = Number(process.env.RATE_LIMIT_OTP_VERIFY_DAILY_DURATION) || 86400
      await check_rate_limit({ key: `rate:otp:verify:daily:${phone}:${ip}`, limit: verify_daily_limit, duration: verify_daily_duration })

      return await service_auth.verify_otp(body, jwt)
    },
    dto_auth.otp_verify,
  )
