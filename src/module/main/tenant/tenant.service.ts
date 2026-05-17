import type { lib_dto_payload } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { createClient } from '@tursodatabase/api'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { db_client, db_redis_main } from '@db/client.db'
import { current_tenant_schema_version, table_tenant, table_user_tenant } from '@db/main.schema.db'
import * as schema_tenant from '@db/tenant.schema.db'
import { select, sync_schema } from '@db/utils.db'

import { lib_error } from '@lib/error.lib'

import { dto_schema_tenant, dto_tenant } from '@module/main/tenant/tenant.dto'

export const service_tenant = {
  async find(query: Static<typeof dto_tenant.find.query>, payload: lib_dto_payload): Promise<Static<typeof dto_tenant.find.response>> {
    const { tenant_id, tenant_type, tenant_name } = query
    const db = await db_client()

    return await select({
      db,
      table: table_tenant,
      allowed_columns: {
        tenant_id: table_tenant.tenant_id,
        tenant_type: table_tenant.tenant_type,
        tenant_name: table_tenant.tenant_name,
        tenant_db_id: table_tenant.tenant_db_id,
        tenant_db_url: table_tenant.tenant_db_url,
        user_id: table_tenant.user_id,
        created_at: table_tenant.created_at,
      },
      joins: [{ table_to_join: table_user_tenant, column_to_join: 'tenant_id' }],
      where: [
        [table_tenant.tenant_id, tenant_id, '[]'],
        [table_tenant.tenant_type, tenant_type, '[]'],
        [table_tenant.tenant_name, tenant_name, '%'],
        [table_user_tenant.user_id, [String(payload.user_id)], '[]'],
      ],
      query,
    })
  },

  async create(body: Static<typeof dto_tenant.create.body>, payload: lib_dto_payload): Promise<Static<typeof dto_tenant.create.response>> {
    const { user_id } = payload
    try {
      const db = await db_client()
      const [user_tenants] = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(table_tenant)
        .where(and(eq(table_tenant.user_id, user_id), isNull(table_tenant.deleted_at)))

      if (user_tenants && user_tenants.count >= 12) {
        throw lib_error.user_max_tenants
      }
    } catch (error: unknown) {
      const err = error as { code?: string }
      if (err?.code !== 'not-found-tenant') throw error
    }

    const db = await db_client()

    const [data] = await db
      .insert(table_tenant)
      .values({ ...body, user_id })
      .returning()

    if (!data) {
      throw lib_error.bad_request
    }

    const { tenant_id } = data

    const turso = createClient({
      org: process.env.TURSO_ORG_NAME!,
      token: process.env.TURSO_API_TOKEN!,
    })

    const { id: tenant_db_id, hostname: tenant_db_url } = await turso.databases.create(
      `db-${process.env.NAME}-${process.env.ENV}-tenant-${tenant_id}`,
      {
        group: process.env.TURSO_GROUP_NAME!,
      },
    )

    const [result] = await db
      .update(table_tenant)
      .set({
        ...body,
        tenant_db_id,
        tenant_db_url,
      })
      .where(eq(table_tenant.tenant_id, tenant_id))
      .returning()

    await this.migrate_schema(tenant_id)

    const { service_access } = await import('@module/tenant/access/access.service')
    await service_access.create_access_for_owner(tenant_id, user_id)

    await db.insert(table_user_tenant).values({
      user_id,
      tenant_id,
    })

    if (!result) throw lib_error.bad_request
    return { data: result! as unknown as Static<typeof dto_schema_tenant> }
  },

  async update(body: Static<typeof dto_tenant.update.body>, payload: lib_dto_payload): Promise<Static<typeof dto_tenant.update.response>> {
    const { tenant_id, ...updates } = body
    const db = await db_client()

    const [data] = await db
      .update(table_tenant)
      .set(updates)
      .where(and(eq(table_tenant.tenant_id, tenant_id), eq(table_tenant.user_id, payload.user_id), isNull(table_tenant.deleted_at)))
      .returning()

    if (!data) throw lib_error.not_found

    return { data: data! as unknown as Static<typeof dto_schema_tenant> }
  },

  async delete(body: Static<typeof dto_tenant.delete.body>, payload: lib_dto_payload): Promise<Static<typeof dto_tenant.delete.response>> {
    const { tenant_id } = body
    const db = await db_client()

    const [data] = await db
      .update(table_tenant)
      .set({ deleted_at: new Date().toISOString() })
      .where(and(eq(table_tenant.tenant_id, tenant_id), eq(table_tenant.user_id, payload.user_id), isNull(table_tenant.deleted_at)))
      .returning()

    if (!data) throw lib_error.not_found

    return { data: data! as unknown as Static<typeof dto_schema_tenant> }
  },

  async migrate_schema(tenant_id: number): Promise<void> {
    const migration_key = `tenant:${tenant_id}:schema_version`
    const cached_version = await db_redis_main.get(migration_key)

    if (cached_version === String(current_tenant_schema_version) || cached_version === 'NOT_FOUND') return

    const db = await db_client()

    const [data] = await db
      .select({
        tenant_schema_version: table_tenant.tenant_schema_version,
        tenant_type: table_tenant.tenant_type,
      })
      .from(table_tenant)
      .where(eq(table_tenant.tenant_id, tenant_id))

    if (!data) {
      await db_redis_main.set(migration_key, 'NOT_FOUND', 'EX', 600)
      return
    }

    if (data.tenant_schema_version !== current_tenant_schema_version) {
      try {
        console.log(`🚀 Updating tenant ${tenant_id} schema to version ${current_tenant_schema_version}...`)
        const db_tenant = await db_client({ tenant_id })

        await sync_schema(db_tenant, schema_tenant)

        await db.update(table_tenant).set({ tenant_schema_version: current_tenant_schema_version }).where(eq(table_tenant.tenant_id, tenant_id))
        console.log(`✅ Tenant ${tenant_id} schema updated successfully.`)
      } catch (error) {
        console.error(`❌ Migration failed for tenant ${tenant_id}:`, error)
        throw lib_error.tenant_schema_update_failed
      }
    }

    await db_redis_main.set(migration_key, String(current_tenant_schema_version))
  },
}
