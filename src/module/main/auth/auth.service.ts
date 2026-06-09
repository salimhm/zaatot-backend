import type { Static } from 'elysia'

import { and, eq, isNull } from 'drizzle-orm'
import { db_client, db_redis_auth } from '@db/client.db'
import { table_organization, table_organization_user } from '@db/main.schema.db'

import { type lib_dto_tenant } from '@lib/dto.lib'
import { lib_error } from '@lib/error.lib'

import { dto_auth } from '@module/main/auth/auth.dto'
import { dto_schema_user } from '@module/main/user/user.dto'
import { service_user } from '@module/main/user/user.service'

const otp_ttl_minutes = Number(process.env.OTP_TTL_MINUTES) || 5

type JWTHelper = {
  sign: (payload: Record<string, string | number | boolean | null | undefined>) => Promise<string>
}

export const service_auth = {
  async send_otp(body: Static<typeof dto_auth.otp_send.body>): Promise<Static<typeof dto_auth.otp_send.response>> {
    const { user_phone, otp_action } = body

    if (otp_action === 'sign_in') await service_user.find({ columns: ['user_id'], user_phone: [user_phone], take: 1 })
    if (otp_action === 'sign_up') {
      try {
        await service_user.find({ columns: ['user_id'], user_phone: [user_phone], take: 1 })
        throw lib_error.phone_already_exist
      } catch (error: unknown) {
        const err = error as { code?: string }
        if (err?.code !== 'not-found-user') throw error
      }
    }

    const array = new Uint32Array(1)
    crypto.getRandomValues(array)
    const otp_code = String(1000 + ((array[0] ?? 0) % 9000))
    const otp_key = `otp:${user_phone}`

    await db_redis_auth.set(otp_key, JSON.stringify({ otp_code, otp_action }), 'EX', otp_ttl_minutes * 60)

    console.log(`[OTP] Sent to ${user_phone}: ${otp_code}`)

    return { success: true }
  },

  async sign_in(args: { user: Static<typeof dto_schema_user>; jwt: JWTHelper }): Promise<Static<typeof dto_auth.otp_verify.response>> {
    const { user, jwt } = args
    const user_id = user.user_id

    let user_schema_version = '0.0.0'
    try {
      const res = await service_user.find({ columns: ['user_id', 'user_schema_version'], user_id: [String(user_id)], take: 1 })
      user_schema_version = (res.data[0] as { user_schema_version?: string | null })?.user_schema_version || '0.0.0'
    } catch (error: unknown) {
      throw error
    }

    const db = db_client()
    const orgs = await db
      .select({
        organization_id: table_organization.organization_id,
        organization_schema_version: table_organization.organization_schema_version,
      })
      .from(table_organization_user)
      .innerJoin(table_organization, eq(table_organization_user.organization_id, table_organization.organization_id))
      .where(and(eq(table_organization_user.user_id, user_id), isNull(table_organization_user.deleted_at), isNull(table_organization.deleted_at)))

    const tenants: lib_dto_tenant[] = [
      { tenant_id: user_id, tenant_type: 'user', tenant_schema_version: user_schema_version },
      ...orgs
        .filter((org) => org.organization_id != null)
        .map((org) => ({
          tenant_id: org.organization_id!,
          tenant_type: 'organization' as const,
          tenant_schema_version: org.organization_schema_version || '0.0.0',
        })),
    ]

    const token = await jwt.sign({
      user_id,
      tenants,
    } as any)

    return { data: { ...user }, token }
  },

  async sign_up(args: {
    user_phone: string
    user_first_name: string
    user_last_name: string
    jwt: JWTHelper
  }): Promise<Static<typeof dto_auth.otp_verify.response>> {
    const { user_phone, user_first_name, user_last_name, jwt } = args
    const { data: user } = await service_user.create({
      user_phone,
      user_first_name,
      user_last_name,
    })

    return await this.sign_in({ user, jwt })
  },

  async verify_otp(body: Static<typeof dto_auth.otp_verify.body>, jwt: JWTHelper): Promise<Static<typeof dto_auth.otp_verify.response>> {
    const { user_phone, otp_code, user_first_name, user_last_name } = body

    const otp_key = `otp:${user_phone}`
    const stored_data = await db_redis_auth.get(otp_key)

    if (!stored_data) throw lib_error.invalid_otp_code

    const otp = JSON.parse(stored_data) as { otp_code: string; otp_action: string }
    if (otp.otp_code !== otp_code) throw lib_error.invalid_otp_code

    await db_redis_auth.del(otp_key)

    try {
      const { data } = await service_user.find({
        columns: ['user_id', 'user_phone', 'user_first_name', 'user_last_name', 'user_image', 'created_at'],
        user_phone: [user_phone],
        take: 1,
      })
      return await this.sign_in({ user: data[0] as Static<typeof dto_schema_user>, jwt })
    } catch (error: unknown) {
      if (otp.otp_action === 'sign_up') {
        if (!user_first_name || !user_last_name) throw lib_error.bad_request
        return await this.sign_up({ user_phone, user_first_name, user_last_name, jwt })
      }

      throw error
    }
  },
}
