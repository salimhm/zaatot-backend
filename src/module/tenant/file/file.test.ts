import { describe, expect, it } from 'bun:test'

import { service_file } from '@module/tenant/file/file.service'

describe('File Service', () => {
  it('should exist', () => {
    expect(service_file).toBeDefined()
  })
})
