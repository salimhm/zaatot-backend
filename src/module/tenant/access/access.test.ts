import { describe, expect, it } from 'bun:test'

import { service_access } from '@module/tenant/access/access.service'

describe('Access Service', () => {
  it('should exist', () => {
    expect(service_access).toBeDefined()
  })
})
