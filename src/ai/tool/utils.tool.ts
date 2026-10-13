import type { consumer_backend_context } from '@ai/execution/execution-contract.ai'

import { lib_error } from '@lib/error.lib'

export const lib_tool_check_context = (options: { context?: { get: (key: string) => unknown } }) => {
  const { context } = options
  const tenant_id = context?.get('tenant_id')
  const contact_phone = context?.get('contact_phone')

  if (!tenant_id) return { success: false, ...lib_error.tenant_is_required }
  if (!contact_phone) return { success: false, ...lib_error.phone_is_required }

  return {
    success: true,
    tenant_id,
    contact_phone,
    payload: { user_id: -1 },
  }
}

// Tools take the user identity only from verified server context, never from model-controlled arguments.
export const lib_tool_own_user_payload = (backend_context: consumer_backend_context) => {
  const { payload } = backend_context
  if (!Number.isSafeInteger(payload.user_id) || payload.user_id <= 0) throw lib_error.unauthorized

  const user_tenant = payload.tenants?.find(
    (tenant) => tenant.tenant_id === payload.user_id && tenant.tenant_type === 'user' && typeof tenant.tenant_schema_version === 'string',
  )
  if (!user_tenant) throw lib_error.unauthorized

  return {
    user_id: payload.user_id,
    tenants: [
      {
        tenant_id: user_tenant.tenant_id,
        tenant_type: user_tenant.tenant_type,
        tenant_schema_version: user_tenant.tenant_schema_version,
      },
    ],
  }
}

export const lib_tool_signal = (options?: { toolContext?: { abortSignal?: AbortSignal }; abortController?: AbortController }) =>
  options?.toolContext?.abortSignal ?? options?.abortController?.signal
