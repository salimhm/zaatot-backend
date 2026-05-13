import { describe, expect, it } from 'bun:test'

import { service_tenant } from '@module/main/tenant/tenant.service'

describe('Tenant Service', () => {
  it('should exist', () => {
    expect(service_tenant).toBeDefined()
  })
})
