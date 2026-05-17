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
