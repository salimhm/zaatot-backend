import type { Static } from 'elysia'

import { and, eq } from 'drizzle-orm'
import { db_client } from '@db/client.db'
import { table_otp } from '@db/main.schema.db'

import { dto_auth } from '@module/main/auth/auth.dto'
import { service_user } from '@module/main/user/user.service'

const otp_ttl_minutes = 5

export const service_auth = {
  async send_otp(body: Static<typeof dto_auth.otp_send.body>): Promise<Static<typeof dto_auth.otp_send.response>> {
    const { user_phone, otp_action } = body
    const db = await db_client()

    if (otp_action === 'sign_in') await service_user.find({ columns: ['user_id'], user_phone: [user_phone], take: 1 })
    if (otp_action === 'sign_up') {
      try {
        await service_user.find({ columns: ['user_id'], user_phone: [user_phone], take: 1 })
        const { lib_error } = require('@lib/error.lib.ts')
        throw lib_error.phone_already_exist
      } catch (error: any) {
        if (error?.code !== 'not-found-user') throw error
      }
    }

    const otp_code = String(Math.floor(1000 + Math.random() * 9000))
    const expires_at = new Date(Date.now() + otp_ttl_minutes * 60 * 1000).toISOString()

    await db.insert(table_otp).values({ otp_action, otp_code, user_phone, expires_at })

    console.log(`[OTP] Sent to ${user_phone}: ${otp_code}`)

    return { success: true }
  },

  async sign_in(args: { user: any; jwt: any }): Promise<Static<typeof dto_auth.otp_verify.response>> {
    const { user, jwt } = args
    const user_id = user.user_id

    const token = await jwt.sign({
      user_id,
    })

    return { data: { ...user }, token }
  },

  async sign_up(args: {
    user_phone: string
    user_first_name: string
    user_last_name: string
    jwt: any
  }): Promise<Static<typeof dto_auth.otp_verify.response>> {
    const { user_phone, user_first_name, user_last_name, jwt } = args
    const { data: user } = await service_user.create({
      user_phone,
      user_first_name,
      user_last_name,
    })

    return await this.sign_in({ user, jwt })
  },

  async verify_otp(body: Static<typeof dto_auth.otp_verify.body>, jwt: any): Promise<Static<typeof dto_auth.otp_verify.response>> {
    const { lib_error } = require('@lib/error.lib.ts')
    const { user_phone, otp_code, user_first_name, user_last_name } = body
    const db = await db_client()

    const [otp] = await db
      .select()
      .from(table_otp)
      .where(and(eq(table_otp.user_phone, user_phone), eq(table_otp.otp_code, otp_code)))
      .orderBy(table_otp.otp_id)
      .limit(1)

    if (!otp) throw lib_error.invalid_otp_code
    if (new Date(otp.expires_at) < new Date()) throw lib_error.code_expired

    await db.delete(table_otp).where(eq(table_otp.user_phone, user_phone))

    try {
      const { data } = await service_user.find({
        columns: ['user_id', 'user_phone', 'user_first_name', 'user_last_name'],
        user_phone: [user_phone],
        take: 1,
      })
      return await this.sign_in({ user: data[0], jwt })
    } catch (error: any) {
      if (otp.otp_action === 'sign_up') {
        if (!user_first_name || !user_last_name) throw lib_error.bad_request
        return await this.sign_up({ user_phone, user_first_name, user_last_name, jwt })
      }

      throw error
    }
  },
}
