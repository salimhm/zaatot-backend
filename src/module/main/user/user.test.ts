import { describe, expect, it } from 'bun:test'

import { service_user } from '@module/main/user/user.service'

describe('User Service', () => {
  it('should exist', () => {
    expect(service_user).toBeDefined()
  })
})
