export const lib_error = {
  bad_request: { status: 400, code: 'bad-request' },
  file_max_size: { status: 400, code: 'file-max-size' },
  user_max_tenants: { status: 400, code: 'user-max-tenants' },
  invalid_token: { status: 401, code: 'invalid-token' },
  invalid_otp_code: { status: 401, code: 'invalid-otp-code' },
  code_expired: { status: 401, code: 'code-expired' },
  unauthorized: { status: 401, code: 'unauthorized' },
  invalid_password: { status: 401, code: 'invalid-password' },
  not_found: { status: 404, code: 'not-found' },
  not_found_user: { status: 404, code: 'not-found-user' },
  not_found_tenant: { status: 404, code: 'not-found-tenant' },
  not_found_contact: { status: 404, code: 'not-found-contact' },
  not_found_access: { status: 404, code: 'not-found-access' },
  not_found_file: { status: 404, code: 'not-found-file' },
  email_already_exist: { status: 409, code: 'email-already-exist' },
  phone_already_exist: { status: 409, code: 'user-phone-exist' },
  tenant_is_required: { status: 422, code: 'tenant-is-required' },
  format_unsupported: { status: 422, code: 'format-unsupported' },
  unprocessable_entity: { status: 422, code: 'unprocessable-entity' },
  invalid_column: { status: 422, code: 'invalid-column' },
  action_not_defined: { status: 422, code: 'action-not-defined' },
  phone_is_required: { status: 422, code: 'phone-is-required' },
  too_many_requests: { status: 429, code: 'too-many-requests' },
  internal_server_error: { status: 500, code: 'internal-server-error' },
  service_unavailable: { status: 503, code: 'service-unavailable' },
  tenant_schema_update_failed: { status: 500, code: 'tenant-schema-update-failed' },
  tenant_not_ready: { status: 503, code: 'tenant-not-ready' },
}

export const handle_error = ({ code, error, set }: { code: string | number | unknown; error: unknown; set: { status?: number | string } }) => {
  const err = error as { status?: number; code?: string; message?: string }
  let status = 500
  let response_code = 'internal-server-error'
  let details: string | undefined = undefined
  let is_custom_error = false

  if (err && typeof err === 'object') {
    if ('status' in err && typeof err.status === 'number') {
      status = err.status
      is_custom_error = true
    }
    if ('code' in err && typeof err.code === 'string') {
      response_code = err.code
      is_custom_error = true
    }
  }

  if (!is_custom_error) {
    if (code === 'VALIDATION') {
      status = 422
      response_code = 'validation-failed'
      details = err.message
    } else if (code === 'NOT_FOUND') {
      status = 404
      response_code = 'not-found'
    } else if (code === 'PARSE') {
      status = 400
      response_code = 'parse-error'
    } else if (code === 'INTERNAL_SERVER_ERROR') {
      status = 500
      response_code = 'internal-server-error'
    } else if (code === 'UNKNOWN') {
      status = 500
      response_code = 'internal-server-error'
    }
  }

  set.status = status

  return {
    code: response_code,
    error: details || err.message || response_code,
  }
}
