import type { lib_dto_payload } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { createClient } from '@tursodatabase/api'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { db_client, db_redis_migration_lock } from '@db/client.db'
import { current_tenant_schema_version, table_tenant, table_user_tenant } from '@db/main.schema.db'
import * as schema_tenant from '@db/tenant.schema.db'
import { select, sync_schema } from '@db/utils.db'

import { lib_error } from '@lib/error.lib'

import { dto_schema_tenant, dto_tenant } from '@module/main/tenant/tenant.dto'

export const service_tenant = {
  async find(query: Static<typeof dto_tenant.find.query>, payload: lib_dto_payload): Promise<Static<typeof dto_tenant.find.response>> {
    const { tenant_id, tenant_type, tenant_name } = query
    const db = db_client()

    return await select({
      db,
      table: table_tenant,
      allowed_columns: {
        tenant_id: table_tenant.tenant_id,
        tenant_type: table_tenant.tenant_type,
        tenant_schema_version: table_tenant.tenant_schema_version,
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
      const db = db_client()
      const [user_tenants] = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(table_tenant)
        .where(and(eq(table_tenant.user_id, user_id), isNull(table_tenant.deleted_at)))

      const max_tenants = Number(process.env.USER_MAX_TENANTS) || 12
      if (user_tenants && user_tenants.count >= max_tenants) {
        throw lib_error.user_max_tenants
      }
    } catch (error: unknown) {
      const err = error as { code?: string }
      if (err?.code !== 'not-found-tenant') throw error
    }

    const db = db_client()

    const [data] = await db
      .insert(table_tenant)
      .values({ ...body, user_id })
      .returning()

    if (!data) {
      throw lib_error.bad_request
    }

    const { tenant_id } = data

    await db.insert(table_user_tenant).values({
      user_id,
      tenant_id,
    })

    try {
      await this.provision_tenant_db(tenant_id, user_id)
    } catch (error) {
      throw lib_error.tenant_provision_failed
    }

    const { deleted_at, ...response_data } = data
    return { data: response_data as Static<typeof dto_schema_tenant> }
  },

  async update(body: Static<typeof dto_tenant.update.body>, payload: lib_dto_payload): Promise<Static<typeof dto_tenant.update.response>> {
    const { tenant_id, ...updates } = body
    const db = db_client()

    const [data] = await db
      .update(table_tenant)
      .set(updates)
      .where(and(eq(table_tenant.tenant_id, tenant_id), eq(table_tenant.user_id, payload.user_id), isNull(table_tenant.deleted_at)))
      .returning()

    if (!data) throw lib_error.not_found

    const { deleted_at, ...response_data } = data
    return { data: response_data as Static<typeof dto_schema_tenant> }
  },

  async delete(body: Static<typeof dto_tenant.delete.body>, payload: lib_dto_payload): Promise<Static<typeof dto_tenant.delete.response>> {
    const { tenant_id } = body
    const db = db_client()

    const [data] = await db
      .update(table_tenant)
      .set({ deleted_at: new Date().toISOString() })
      .where(and(eq(table_tenant.tenant_id, tenant_id), eq(table_tenant.user_id, payload.user_id), isNull(table_tenant.deleted_at)))
      .returning()

    if (!data) throw lib_error.not_found

    const { deleted_at, ...response_data } = data
    return { data: response_data as Static<typeof dto_schema_tenant> }
  },

  async provision_tenant_db(tenant_id: number, user_id: number): Promise<void> {
    try {
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

      const db = db_client()
      await db
        .update(table_tenant)
        .set({
          tenant_db_id,
          tenant_db_url,
        })
        .where(eq(table_tenant.tenant_id, tenant_id))

      await this.migrate_schema(tenant_id)

      const { service_access } = await import('@module/tenant/access/access.service')
      await service_access.create_access_for_owner(tenant_id, user_id)
    } catch (error) {
      console.error(error)
      throw error
    }
  },

  async migrate_schema(tenant_id: number): Promise<boolean> {
    const db = db_client()

    const [data] = await db
      .select({
        tenant_schema_version: table_tenant.tenant_schema_version,
        tenant_db_url: table_tenant.tenant_db_url,
      })
      .from(table_tenant)
      .where(eq(table_tenant.tenant_id, tenant_id))

    if (!data) return false

    if (!data.tenant_db_url) throw lib_error.tenant_not_ready

    if (data.tenant_schema_version === current_tenant_schema_version) return true

    const lock_key = `lock:tenant:${tenant_id}:migration`
    const is_locked = await db_redis_migration_lock.set(lock_key, '1', 'NX', 'PX', '30000')
    if (is_locked !== 'OK') throw lib_error.tenant_not_ready

    try {
      console.log(`🚀 Updating tenant ${tenant_id} schema to version ${current_tenant_schema_version}...`)
      const db_tenant = db_client({ tenant_id })
      await sync_schema(db_tenant, schema_tenant)
      await db.update(table_tenant).set({ tenant_schema_version: current_tenant_schema_version }).where(eq(table_tenant.tenant_id, tenant_id))
      console.log(`✅ Tenant ${tenant_id} schema updated successfully.`)
      return true
    } catch (error) {
      console.error(`❌ Migration failed for tenant ${tenant_id}:`, error)
      throw lib_error.tenant_schema_update_failed
    } finally {
      await db_redis_migration_lock.del(lock_key)
    }
  },
}
