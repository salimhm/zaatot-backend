import { check_rate_limit, get_ip } from '@db/utils.db'

import { lib_error } from '@lib/error.lib'

import { service_tenant } from '@module/main/tenant/tenant.service'

export const apply_security_headers = ({ set }: any) => {
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

export const apply_rate_limit = async ({ request, server }: any) => {
  const ip = get_ip(request, server)
  await check_rate_limit({ key: `rate:global:${ip}`, limit: 120, duration: 60 })
}

export const apply_tenant_migration = async ({ params, query, body }: any) => {
  const p = (params || {}) as any
  const q = (query || {}) as any
  const b = (body || {}) as any

  const tenant_id = p.tenant_id || q.tenant_id || b.tenant_id
  if (!tenant_id) return

  await service_tenant.migrate_schema(Number(tenant_id))
}

export const derive_auth = async ({ headers: { authorization }, jwt }: any) => {
  if (!authorization) throw lib_error.invalid_token

  const token = authorization.split(' ')[1]

  if (!token) throw lib_error.invalid_token

  const payload = await jwt.verify(token)

  if (!payload) throw lib_error.invalid_token

  return {
    payload,
  }
}

export const guard_auth = async ({ headers: { authorization }, jwt }: any) => {
  if (!authorization) throw lib_error.invalid_token

  const token = authorization.split(' ')[1]

  if (!token) throw lib_error.invalid_token

  const payload = await jwt.verify(token)

  if (!payload) throw lib_error.invalid_token
}
