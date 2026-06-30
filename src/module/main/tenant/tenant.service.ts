import { createClient } from '@tursodatabase/api'

import { eq } from 'drizzle-orm'
import { db_client, db_redis_migration_lock } from '@db/client.db'
import { current_schema_version, table_organization, table_user } from '@db/main.schema.db'
import { sync_schema } from '@db/utils.db'

import { enum_tenant_type } from '@lib/enum.lib'
import { lib_error } from '@lib/error.lib'

export const service_tenant = {
  async provision_tenant_db(options: { tenant_id: number; user_id: number; tenant_type: (typeof enum_tenant_type)[number] }): Promise<void> {
    const { tenant_id, user_id, tenant_type } = options
    const turso = createClient({
      org: process.env.TURSO_ORG_NAME!,
      token: process.env.TURSO_API_TOKEN!,
    })

    const db_name = `db-${process.env.APP_NAME}-${process.env.ENV}-${tenant_type}-${tenant_id}`
    const { id: db_id, hostname: db_url } = await turso.databases.create(db_name, {
      group: process.env.TURSO_GROUP_NAME!,
    })

    const db = db_client()
    if (tenant_type === 'user') {
      await db
        .update(table_user)
        .set({
          user_db_id: db_id,
          user_db_url: db_url,
        })
        .where(eq(table_user.user_id, tenant_id))
    } else if (tenant_type === 'organization') {
      await db
        .update(table_organization)
        .set({
          organization_db_id: db_id,
          organization_db_url: db_url,
        })
        .where(eq(table_organization.organization_id, tenant_id))
    } else {
      return
    }

    await this.migrate_schema({ tenant_id, tenant_type })

    const { service_access } = await import('@module/tenant/access/access.service')
    await service_access.create_access_for_owner({ tenant_id, user_id, tenant_type })
  },

  async migrate_schema(options: { tenant_id: number; tenant_type: (typeof enum_tenant_type)[number] }): Promise<boolean> {
    const { tenant_id, tenant_type } = options
    const db = db_client()

    let schema_version: string | null = null
    let db_url: string | null = null

    if (tenant_type === 'user') {
      const [data] = await db
        .select({
          schema_version: table_user.user_schema_version,
          db_url: table_user.user_db_url,
        })
        .from(table_user)
        .where(eq(table_user.user_id, tenant_id))

      if (data) {
        schema_version = data.schema_version
        db_url = data.db_url
      }
    } else if (tenant_type === 'organization') {
      const [data] = await db
        .select({
          schema_version: table_organization.organization_schema_version,
          db_url: table_organization.organization_db_url,
        })
        .from(table_organization)
        .where(eq(table_organization.organization_id, tenant_id))

      if (data) {
        schema_version = data.schema_version
        db_url = data.db_url
      }
    } else {
      return false
    }

    if (!db_url) {
      throw lib_error[`${tenant_type}_not_ready` as keyof typeof lib_error] ?? lib_error.tenant_not_ready
    }

    const current_version = current_schema_version[tenant_type]

    if (schema_version === current_version) return true

    const lock_key = `lock:${tenant_type}:${tenant_id}:migration`
    const is_locked = await db_redis_migration_lock.set(lock_key, '1', 'NX', 'PX', '30000')
    if (is_locked !== 'OK') {
      throw lib_error[`${tenant_type}_not_ready` as keyof typeof lib_error] ?? lib_error.tenant_not_ready
    }

    try {
      const db_tenant = db_client({
        tenant_id,
        payload: {
          user_id: 0,
          tenants: [{ tenant_id, tenant_type, tenant_schema_version: '' }],
        },
      })
      const target_schema = tenant_type === 'user' ? await import('@db/user.schema.db') : await import('@db/organization.schema.db')

      await sync_schema(db_tenant, target_schema)

      if (tenant_type === 'user') {
        await db.update(table_user).set({ user_schema_version: current_version }).where(eq(table_user.user_id, tenant_id))
      } else if (tenant_type === 'organization') {
        await db
          .update(table_organization)
          .set({ organization_schema_version: current_version })
          .where(eq(table_organization.organization_id, tenant_id))
      }
      return true
    } catch (error) {
      console.error(`Migration failed for ${tenant_type} ${tenant_id}:`, error)
      throw lib_error[`${tenant_type}_schema_update_failed` as keyof typeof lib_error] ?? lib_error.tenant_schema_update_failed
    } finally {
      await db_redis_migration_lock.del(lock_key)
    }
  },
}
