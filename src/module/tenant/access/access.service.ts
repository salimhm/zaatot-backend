import type { lib_dto_payload } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { and, eq, isNull } from 'drizzle-orm'
import { db_client } from '@db/client.db'
import { entity_access } from '@db/tenant.schema.db'
import { select } from '@db/utils.db'

import { enum_access_action } from '@lib/enum.lib'
import { lib_error } from '@lib/error.lib'

import { dto_access } from '@module/tenant/access/access.dto'

export const service_access = {
  async find(query: Static<typeof dto_access.find.query>, payload: lib_dto_payload): Promise<Static<typeof dto_access.find.response>> {
    const { tenant_id, user_id } = query as any
    await this.check_access(tenant_id, payload)

    const db = await db_client({ tenant_id })

    return await select({
      db,
      table: entity_access,
      allowed_columns: {
        access_id: entity_access.access_id,
        user_id: entity_access.user_id,
        actions: entity_access.actions,
        created_at: entity_access.created_at,
      },
      where: [[entity_access.user_id, user_id, '[]']],
      query,
    })
  },

  async create(body: Static<typeof dto_access.create.body>, payload: lib_dto_payload): Promise<Static<typeof dto_access.create.response>> {
    const { tenant_id, user_id, actions } = body
    await this.check_access(tenant_id, payload)

    const db_tenant = await db_client({ tenant_id })
    const [data] = await db_tenant
      .insert(entity_access)
      .values({
        user_id,
        actions,
      })
      .returning()

    return { data }
  },

  async update(body: Static<typeof dto_access.update.body>, payload: lib_dto_payload): Promise<Static<typeof dto_access.update.response>> {
    const { tenant_id, user_id, actions } = body
    await this.check_access(tenant_id, payload)

    const db = await db_client({ tenant_id })
    const [data] = await db
      .update(entity_access)
      .set({ actions })
      .where(and(eq(entity_access.user_id, user_id), isNull(entity_access.deleted_at)))
      .returning()

    if (!data) throw lib_error.not_found

    return { data }
  },

  async delete(body: Static<typeof dto_access.delete.body>, payload: lib_dto_payload): Promise<Static<typeof dto_access.delete.response>> {
    const { tenant_id, user_id } = body
    await this.check_access(tenant_id, payload)

    const db_tenant = await db_client({ tenant_id })
    const [data] = await db_tenant
      .update(entity_access)
      .set({ deleted_at: new Date().toISOString() })
      .where(and(eq(entity_access.user_id, user_id), isNull(entity_access.deleted_at)))
      .returning()

    return { data }
  },

  async create_access_for_owner(tenant_id: number, user_id: number): Promise<void> {
    const db_tenant = await db_client({ tenant_id })
    await db_tenant.insert(entity_access).values({
      user_id,
      actions: ['owner'],
    })
  },

  async check_access(tenant_id: number, payload: lib_dto_payload, required_access: ((typeof enum_access_action)[number] | 'owner')[] = ['owner']) {
    if (payload.user_id <= -1) return
    try {
      const db = await db_client({ tenant_id })
      const [access] = await db
        .select({ actions: entity_access.actions })
        .from(entity_access)
        .where(and(eq(entity_access.user_id, payload.user_id), isNull(entity_access.deleted_at)))
        .limit(1)

      if (!access?.actions?.length) throw lib_error.unauthorized
      if (access.actions.includes('owner')) return
      if (access.actions.includes('full_access') && !required_access.includes('owner')) return
      if (!required_access.some((r) => access.actions.includes(r))) throw lib_error.unauthorized
    } catch (error) {
      throw lib_error.unauthorized
    }
  },
}
