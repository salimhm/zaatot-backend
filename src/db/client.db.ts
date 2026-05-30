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

export function get_tenant_url(tenant_id: number): string {
  const db_name = `db-${process.env.NAME}-${process.env.ENV}-tenant-${tenant_id}`
  return `https://${db_name}-${process.env.TURSO_ORG_NAME}.turso.io`
}

export async function db_client(options: { url?: string; token?: string; tenant_id?: number } = {}) {
  const { url, token, tenant_id } = options

  if (tenant_id != null) {
    const resolved_url = get_tenant_url(tenant_id)
    const resolved_token = token || process.env.TURSO_GROUP_TOKEN!
    const client = createClient({ url: resolved_url, authToken: resolved_token })
    return drizzle(client) as LibSQLDatabase<Record<string, unknown>>
  }

  const resolved_url = url || process.env.TURSO_DB_MAIN_URL!
  const resolved_token = token || process.env.TURSO_DB_MAIN_TOKEN!
  const main_key = `${resolved_url}:${resolved_token}`

  const cached = main_cache.get(main_key)
  if (cached) return cached.db

  const client = createClient({ url: resolved_url, authToken: resolved_token })
  const db = drizzle(client) as LibSQLDatabase<Record<string, unknown>>
  main_cache.set(main_key, { db, client })
  return db
}

export const db_redis_main = new RedisClient(process.env.REDIS_DB_MAIN_URL!)
