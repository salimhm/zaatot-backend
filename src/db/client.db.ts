import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'

import { RedisClient } from 'bun'

import { createClient } from '@libsql/client'

import { drizzle } from 'drizzle-orm/libsql'

interface cached_connection {
  db: LibSQLDatabase<Record<string, unknown>>
  client: Client
}

const main_cache = new Map<string, cached_connection>()
const max_cached_tenants = Number(process.env.DB_MAX_CACHED_TENANTS) || 1200
const tenant_cache = new Map<number, cached_connection>()

export function get_tenant_url(tenant_id: number): string {
  const db_name = `db-${process.env.NAME}-${process.env.ENV}-tenant-${tenant_id}`
  return `https://${db_name}-${process.env.TURSO_ORG_NAME}.turso.io`
}

export function db_client(options: { url?: string; token?: string; tenant_id?: number } = {}) {
  const { url, token, tenant_id } = options

  if (tenant_id != null) {
    if (tenant_cache.has(tenant_id)) {
      const cached = tenant_cache.get(tenant_id)!
      tenant_cache.delete(tenant_id)
      tenant_cache.set(tenant_id, cached)
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

    const resolved_url = get_tenant_url(tenant_id)
    const resolved_token = token || process.env.TURSO_GROUP_TOKEN!
    const client = createClient({ url: resolved_url, authToken: resolved_token })
    const db = drizzle(client) as LibSQLDatabase<Record<string, unknown>>
    tenant_cache.set(tenant_id, { db, client })
    return db
  }

  const resolved_url = url || process.env.TURSO_DB_MAIN_URL!
  const resolved_token = token || process.env.TURSO_DB_MAIN_TOKEN!
  const main_key = resolved_url

  const cached = main_cache.get(main_key)
  if (cached) return cached.db

  const client = createClient({ url: resolved_url, authToken: resolved_token })
  const db = drizzle(client) as LibSQLDatabase<Record<string, unknown>>
  main_cache.set(main_key, { db, client })
  return db
}

export const db_redis_main = new RedisClient(process.env.REDIS_DB_MAIN_URL!)

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
    db_redis_main.close()
  } catch {}
}
