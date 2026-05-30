import type { lib_dto_payload } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { and, eq, isNull } from 'drizzle-orm'
import { db_client } from '@db/client.db'
import { table_access } from '@db/tenant.schema.db'
import { select } from '@db/utils.db'

import { enum_access_action } from '@lib/enum.lib'
import { lib_error } from '@lib/error.lib'

import { dto_access, dto_schema_access } from '@module/tenant/access/access.dto'

export const service_access = {
  async find(query: Static<typeof dto_access.find.query>, payload: lib_dto_payload): Promise<Static<typeof dto_access.find.response>> {
    const { tenant_id, user_id } = query
    await this.check_access(tenant_id, payload)

    const db = await db_client({ tenant_id })

    return await select({
      db,
      table: table_access,
      allowed_columns: {
        access_id: table_access.access_id,
        user_id: table_access.user_id,
        actions: table_access.actions,
        created_at: table_access.created_at,
      },
      where: [[table_access.user_id, user_id, '[]']],
      query,
    })
  },

  async create(body: Static<typeof dto_access.create.body>, payload: lib_dto_payload): Promise<Static<typeof dto_access.create.response>> {
    const { tenant_id, user_id, actions } = body
    await this.check_access(tenant_id, payload)

    const db_tenant = await db_client({ tenant_id })
    const [data] = await db_tenant
      .insert(table_access)
      .values({
        user_id,
        actions,
      })
      .returning()

    if (!data) throw lib_error.bad_request
    const { deleted_at, ...response_data } = data
    return { data: response_data as Static<typeof dto_schema_access> }
  },

  async update(body: Static<typeof dto_access.update.body>, payload: lib_dto_payload): Promise<Static<typeof dto_access.update.response>> {
    const { tenant_id, user_id, actions } = body
    await this.check_access(tenant_id, payload)

    const db = await db_client({ tenant_id })
    const [data] = await db
      .update(table_access)
      .set({ actions })
      .where(and(eq(table_access.user_id, user_id), isNull(table_access.deleted_at)))
      .returning()

    if (!data) throw lib_error.not_found
    const { deleted_at, ...response_data } = data
    return { data: response_data as Static<typeof dto_schema_access> }
  },

  async delete(body: Static<typeof dto_access.delete.body>, payload: lib_dto_payload): Promise<Static<typeof dto_access.delete.response>> {
    const { tenant_id, user_id } = body
    await this.check_access(tenant_id, payload)

    const db_tenant = await db_client({ tenant_id })
    const [data] = await db_tenant
      .update(table_access)
      .set({ deleted_at: new Date().toISOString() })
      .where(and(eq(table_access.user_id, user_id), isNull(table_access.deleted_at)))
      .returning()

    if (!data) throw lib_error.not_found
    const { deleted_at, ...response_data } = data
    return { data: response_data as Static<typeof dto_schema_access> }
  },

  async create_access_for_owner(tenant_id: number, user_id: number): Promise<void> {
    const db_tenant = await db_client({ tenant_id })
    await db_tenant.insert(table_access).values({
      user_id,
      actions: ['owner'],
    })
  },

  async check_access(tenant_id: number, payload: lib_dto_payload, required_access: ((typeof enum_access_action)[number] | 'owner')[] = ['owner']) {
    if (payload.user_id <= -1) return
    try {
      const db = await db_client({ tenant_id })
      const [access] = await db
        .select({ actions: table_access.actions })
        .from(table_access)
        .where(and(eq(table_access.user_id, payload.user_id), isNull(table_access.deleted_at)))
        .limit(1)

      if (!access?.actions?.length) throw lib_error.unauthorized
      if (access.actions.includes('owner')) return
      if (access.actions.includes('full_access') && !required_access.includes('owner')) return
      if (!required_access.some((r) => access.actions.includes(r))) throw lib_error.unauthorized
    } catch (error) {
      const err = error as { code?: string }
      const is_not_found = !err?.code || err.code.startsWith('not-found')
      if (!is_not_found) throw error
      throw lib_error.unauthorized
    }
  },
}
