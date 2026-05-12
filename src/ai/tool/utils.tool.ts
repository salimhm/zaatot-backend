import { lib_error } from '@lib/error.lib'

import { service_contact } from '@module/tenant/contact/contact.service'

export const lib_tool_check_context = (options: any): any => {
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

export const lib_tool_check_contact_name = async (tenant_id: number, contact_phone: string) => {
  const payload = { user_id: -1 }
  try {
    const { data: contacts } = await service_contact.find({ tenant_id, contact_phone: [contact_phone], take: 1, columns: ['contact_name'] }, payload)
    const contact = contacts[0]

    if (!contact?.contact_name) {
      return {
        success: false,
        message: `The contact name is required. You MUST ask for the user name and update their contact record using tool_update_contact before proceeding.`,
      }
    }
    return { success: true }
  } catch (error: any) {
    if (error?.code === 'not-found-contact') {
      return {
        success: false,
        message: `The contact name is required. You MUST ask for the user name and update their contact record using tool_update_contact before proceeding.`,
      }
    }
    throw error
  }
}
