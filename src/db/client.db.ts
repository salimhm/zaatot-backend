import { RedisClient } from 'bun'
import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'

import { createClient } from '@libsql/client'

import { drizzle } from 'drizzle-orm/libsql'

import { type lib_dto_payload } from '@lib/dto.lib'
import { enum_tenant_type } from '@lib/enum.lib'

interface cached_connection {
  db: LibSQLDatabase<Record<string, unknown>>
  client: Client
}

const main_cache = new Map<string, cached_connection>()
const max_cached_tenants = Number(process.env.DB_MAX_CACHED_TENANTS) || 1800
const tenant_cache = new Map<string, cached_connection>()

export function get_tenant_type(tenant_id: number, payload: lib_dto_payload): (typeof enum_tenant_type)[number] {
  return payload?.tenants?.find((t) => t.tenant_id === tenant_id)?.tenant_type || 'organization'
}

export function get_tenant_url(tenant_id: number, tenant_type: (typeof enum_tenant_type)[number] = 'organization'): string {
  const db_name = `db-${process.env.APP_NAME}-${process.env.ENV}-${tenant_type}-${tenant_id}`
  return `https://${db_name}-${process.env.TURSO_ORG_NAME}.turso.io`
}

export function db_client(
  options:
    | {
        tenant_id?: never
        payload?: never
      }
    | {
        tenant_id: number
        payload: lib_dto_payload
      } = {},
) {
  const { tenant_id, payload } = options

  if (tenant_id != null && payload != null) {
    const tenant_type = get_tenant_type(tenant_id, payload)
    const cache_key = `${tenant_type}:${tenant_id}`

    if (tenant_cache.has(cache_key)) {
      const cached = tenant_cache.get(cache_key)!
      tenant_cache.delete(cache_key)
      tenant_cache.set(cache_key, cached)
      return cached.db
    }

    if (tenant_cache.size >= max_cached_tenants) {
      const oldest_key = tenant_cache.keys().next().value
      if (oldest_key !== undefined) {
        const oldest = tenant_cache.get(oldest_key)
        try {
          if (oldest) oldest.client.close()
        } finally {
          tenant_cache.delete(oldest_key)
        }
      }
    }

    const tenant_url = get_tenant_url(tenant_id, tenant_type)
    const tenant_token = process.env.TURSO_GROUP_TOKEN!
    const client = createClient({ url: tenant_url, authToken: tenant_token })
    const db = drizzle(client) as LibSQLDatabase<Record<string, unknown>>
    tenant_cache.set(cache_key, { db, client })
    return db
  }

  const main_url = process.env.TURSO_DB_MAIN_URL!
  const main_token = process.env.TURSO_DB_MAIN_TOKEN!
  const main_key = main_url

  const cached = main_cache.get(main_key)
  if (cached) return cached.db

  const client = createClient({ url: main_url, authToken: main_token })
  const db = drizzle(client) as LibSQLDatabase<Record<string, unknown>>
  main_cache.set(main_key, { db, client })
  return db
}

export const db_redis_auth = new RedisClient(process.env.REDIS_DB_AUTH_URL!)
export const db_redis_tenant_access = new RedisClient(process.env.REDIS_DB_TENANT_ACCESS_URL!)
export const db_redis_migration_lock = new RedisClient(process.env.REDIS_DB_MIGRATION_LOCK_URL!)
export const db_redis_rate_limiting = new RedisClient(process.env.REDIS_DB_RATE_LIMITING_URL!)

export function close_all_connections() {
  for (const cached of tenant_cache.values()) {
    try {
      cached.client.close()
    } catch {}
  }
  tenant_cache.clear()

  for (const cached of main_cache.values()) {
    try {
      cached.client.close()
    } catch {}
  }
  main_cache.clear()

  try {
    db_redis_auth.close()
  } catch {}

  try {
    db_redis_tenant_access.close()
  } catch {}

  try {
    db_redis_migration_lock.close()
  } catch {}

  try {
    db_redis_rate_limiting.close()
  } catch {}
}
