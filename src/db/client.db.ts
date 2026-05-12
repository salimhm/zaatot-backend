import { createClient } from '@libsql/client'

import { drizzle } from 'drizzle-orm/libsql'

export function get_tenant_url(tenant_id: number): string {
  const db_name = `db-${process.env.NAME}-${process.env.ENV}-tenant-${tenant_id}`
  return `libsql://${db_name}-${process.env.TURSO_ORG_NAME}.turso.io`
}

export async function db_client(options: { url?: string; token?: string; tenant_id?: number } = {}) {
  const { url, token, tenant_id } = options

  const resolved_url = tenant_id ? get_tenant_url(tenant_id) : url || process.env.TURSO_DB_MAIN_URL!

  const resolved_token = tenant_id ? token || process.env.TURSO_GROUP_TOKEN! : token || process.env.TURSO_DB_MAIN_TOKEN!

  return drizzle(
    createClient({
      url: resolved_url,
      authToken: resolved_token,
    }),
  )
}
