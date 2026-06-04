import type { lib_dto_payload } from '@lib/dto.lib'
import type { Context } from 'elysia'

import { current_tenant_schema_version } from '@db/main.schema.db'
import { check_rate_limit, get_ip } from '@db/utils.db'

import { lib_error } from '@lib/error.lib'

import { service_tenant } from '@module/main/tenant/tenant.service'

export interface ElysiaJWT {
  sign: (payload: Record<string, string | number | boolean | null | undefined>) => Promise<string>
  verify: (jwt?: string, options?: Record<string, unknown>) => Promise<Record<string, unknown> | string | false | null>
}

export const apply_security_headers = ({ set }: Pick<Context, 'set'>): void => {
  set.headers['X-Content-Type-Options'] = 'nosniff'
  set.headers['X-Frame-Options'] = 'DENY'
  set.headers['X-XSS-Protection'] = '1; mode=block'
  set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
  set.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
  set.headers['Content-Security-Policy'] = "default-src 'none'; frame-ancestors 'none';"
  set.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
  set.headers['Cross-Origin-Resource-Policy'] = 'same-origin'
  set.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
  set.headers['X-Permitted-Cross-Domain-Policies'] = 'none'
}

export const apply_rate_limit = async ({ request, server }: Pick<Context, 'request' | 'server'>): Promise<void> => {
  const ip = get_ip(request, server)
  const limit = Number(process.env.RATE_LIMIT_GLOBAL_LIMIT) || 120
  const duration = Number(process.env.RATE_LIMIT_GLOBAL_DURATION) || 60
  await check_rate_limit({ key: `rate:global:${ip}`, limit, duration })
}

export const apply_tenant_migration = async ({
  params,
  query,
  body,
  set,
  headers: { authorization },
  jwt,
}: Pick<Context, 'params' | 'query' | 'body' | 'set' | 'headers'> & { jwt: ElysiaJWT }): Promise<void> => {
  const p = (params || {}) as Record<string, string | undefined>
  const q = (query || {}) as Record<string, string | undefined>
  const b = (body || {}) as Record<string, unknown>

  const tenant_id = p.tenant_id || q.tenant_id || b.tenant_id
  if (!tenant_id) return

  const token = authorization?.split(' ')[1]
  const payload = token ? ((await jwt.verify(token)) as lib_dto_payload | false) : false

  if (!payload) return

  let schemas: Record<string, string> = {}
  if (payload.tenant_schemas) {
    try {
      schemas = JSON.parse(payload.tenant_schemas)
    } catch {
      schemas = {}
    }
  }
  const tenant_key = String(tenant_id)

  if (schemas[tenant_key] === current_tenant_schema_version) return

  const parsed_id = Number(tenant_id)
  const migrated = await service_tenant.migrate_schema(parsed_id)

  if (migrated) {
    schemas[tenant_key] = current_tenant_schema_version
    const refreshed_token = await jwt.sign({
      user_id: payload.user_id,
      tenant_schemas: JSON.stringify(schemas),
    })
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

export const guard_auth = async ({ headers: { authorization }, jwt }: Pick<Context, 'headers'> & { jwt: ElysiaJWT }): Promise<void> => {
  if (!authorization) throw lib_error.invalid_token

  const token = authorization.split(' ')[1]

  if (!token) throw lib_error.invalid_token

  const payload = (await jwt.verify(token)) as lib_dto_payload | false

  if (!payload) throw lib_error.invalid_token
}
