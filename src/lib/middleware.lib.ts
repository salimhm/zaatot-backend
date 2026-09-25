import type { lib_dto_payload, lib_dto_tenant } from '@lib/dto.lib'
import type { Context } from 'elysia'

import { db_redis_rate_limiting } from '@db/client.db'
import { current_schema_version } from '@db/main.schema.db'

import { lib_error } from '@lib/error.lib'

import { service_tenant } from '@module/main/tenant/tenant.service'

export interface ElysiaJWT {
  sign: (payload: Record<string, string | number | boolean | null | undefined>) => Promise<string>
  verify: (jwt?: string, options?: Record<string, unknown>) => Promise<Record<string, unknown> | string | false | null>
}

export const apply_security_headers = ({ set, request }: Pick<Context, 'set' | 'request'>): void => {
  set.headers['X-Content-Type-Options'] = 'nosniff'
  set.headers['X-Frame-Options'] = 'DENY'
  set.headers['X-XSS-Protection'] = '1; mode=block'
  set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
  set.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
  const ai_test = process.env.ENV === 'dev' && new URL(request.url).pathname.startsWith('/ai/test')
  set.headers['Content-Security-Policy'] = ai_test
    ? "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; connect-src 'self'; script-src 'self'; style-src 'self'"
    : "default-src 'none'; frame-ancestors 'none';"
  set.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
  set.headers['Cross-Origin-Resource-Policy'] = 'same-origin'
  set.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
  set.headers['X-Permitted-Cross-Domain-Policies'] = 'none'
}

export const apply_rate_limit = async ({ request, server }: Pick<Context, 'request' | 'server'>): Promise<void> => {
  const ip = get_ip(request, server)
  const limit = Number(process.env.RATE_LIMIT_GLOBAL_IP_LIMIT) || 120
  const duration = Number(process.env.RATE_LIMIT_GLOBAL_IP_DURATION) || 60
  await check_rate_limit({ key: `rate:global:${ip}`, limit, duration })
}

export const apply_tenant_migration = async ({
  params,
  query,
  body,
  set,
  payload,
  jwt,
}: Pick<Context, 'params' | 'query' | 'body' | 'set'> & { payload?: lib_dto_payload; jwt: ElysiaJWT }): Promise<void> => {
  const p = (params || {}) as Record<string, string | undefined>
  const q = (query || {}) as Record<string, string | undefined>
  const b = (body || {}) as Record<string, unknown>

  const tenant_id = p.tenant_id || q.tenant_id || b.tenant_id
  if (!tenant_id) return

  if (!payload) return

  const tenants_map: lib_dto_tenant[] = payload.tenants ?? []

  const tenant_key = Number(tenant_id)
  const entry = tenants_map.find((t) => t.tenant_id === tenant_key)
  if (!entry) return

  const tenant_type = entry.tenant_type
  const target_version = current_schema_version[tenant_type]
  if (entry.tenant_schema_version === target_version) return

  const migrated = await service_tenant.migrate_schema({ tenant_id: tenant_key, tenant_type })

  if (migrated) {
    entry.tenant_schema_version = target_version
    const refreshed_token = await jwt.sign({
      user_id: payload.user_id,
      tenants: tenants_map,
    } as any)
    set.headers['X-Refresh-Token'] = refreshed_token
  }
}

export const derive_auth = async ({
  headers: { authorization },
  jwt,
}: Pick<Context, 'headers'> & { jwt: ElysiaJWT }): Promise<{ payload: lib_dto_payload }> => {
  if (!authorization) throw lib_error.invalid_token

  const token = authorization.split(' ')[1]

  if (!token) throw lib_error.invalid_token

  const payload = (await jwt.verify(token)) as lib_dto_payload | false

  if (!payload) throw lib_error.invalid_token

  return {
    payload,
  }
}

export const guard_auth = ({ payload }: { payload: lib_dto_payload }): void => {
  if (!payload) throw lib_error.invalid_token
}

export const check_rate_limit = async (options: { key: string; limit: number; duration: number }): Promise<void> => {
  if (process.env.ENV === 'dev' && process.env.DISABLE_RATE_LIMITS_IN_DEV === 'true') return

  const { key, limit, duration } = options
  await db_redis_rate_limiting.set(key, '0', 'NX', 'EX', String(duration))
  const current = await db_redis_rate_limiting.incr(key)
  if (current > limit) {
    throw lib_error.too_many_requests
  }
}

export const get_ip = (request: Request, server?: { requestIP: (req: Request) => { address: string } | null } | null) => {
  return server?.requestIP(request)?.address || '127.0.0.1'
}
