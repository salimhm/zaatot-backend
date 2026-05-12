---
name: example-errors
description: Required code pattern for all errors generated outputs.
---

* **error.lib.ts**: Strictly follow this pattern!
```typescript
// @ts-ignore
export const lib_error = {
  bad_request: { status: 400, code: 'bad-request', message: 'bad request' },
  invalid_token: { status: 401, code: 'invalid-token', message: 'invalid token' },
  invalid_otp_code: { status: 401, code: 'invalid-otp-code', message: 'invalid otp code' },
  code_expired: { status: 401, code: 'code-expired', message: 'code expired' },
  unauthorized: { status: 401, code: 'unauthorized', message: 'unauthorized' },
  not_found: { status: 404, code: 'not-found', message: 'not found' },
  phone_already_exist: { status: 409, code: 'user-phone-exist', message: 'user phone exist' },
  unprocessable_entity: { status: 422, code: 'unprocessable-entity', message: 'unprocessable entity' },
  invalid_column: { status: 422, code: 'invalid-column', message: 'invalid column' },
  action_not_defined: { status: 422, code: 'action-not-defined', message: 'action not defined' },
  internal_server_error: { status: 500, code: 'internal-server-error', message: 'internal server error' },
  service_unavailable: { status: 503, code: 'service-unavailable', message: 'service unavailable' },
  // rest of errors
}
```