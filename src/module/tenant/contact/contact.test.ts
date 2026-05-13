import { describe, expect, it } from 'bun:test'

import { service_contact } from '@module/tenant/contact/contact.service'

describe('Contact Service', () => {
  it('should exist', () => {
    expect(service_contact).toBeDefined()
  })
})
