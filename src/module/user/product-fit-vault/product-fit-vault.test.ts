import { describe, expect, it } from 'bun:test'

import { product_fit_consent_is_active, product_fit_profile_is_covered } from '@module/user/product-fit-vault/product-fit-vault.util'

const now = Date.parse('2026-09-14T12:00:00Z')
const consent = {
  consent_status: 'granted',
  effective_at: '2026-09-13T12:00:00Z',
  expires_at: null,
  withdrawn_at: null,
  deleted_at: null,
}
const profile = {
  product_fit_profile_id: 2,
  profile_version: 3,
  deleted_at: null,
  superseded_at: null,
  effective_at: '2026-09-13T12:00:00Z',
}
describe('Store A authorization policy', () => {
  it('requires active consent and rejects withdrawn, expired, future and malformed records', () => {
    expect(product_fit_consent_is_active(consent, now)).toBe(true)
    expect(product_fit_consent_is_active(undefined, now)).toBe(false)
    expect(product_fit_consent_is_active({ ...consent, consent_status: 'withdrawn' }, now)).toBe(false)
    expect(product_fit_consent_is_active({ ...consent, withdrawn_at: '2026-09-14T10:00:00Z' }, now)).toBe(false)
    expect(product_fit_consent_is_active({ ...consent, deleted_at: '2026-09-14T10:00:00Z' }, now)).toBe(false)
    expect(product_fit_consent_is_active({ ...consent, expires_at: '2026-09-14T12:00:00Z' }, now)).toBe(false)
    expect(product_fit_consent_is_active({ ...consent, effective_at: '2027-01-01T00:00:00Z' }, now)).toBe(false)
    expect(product_fit_consent_is_active({ ...consent, expires_at: 'invalid' }, now)).toBe(false)
    expect(product_fit_consent_is_active({ ...consent, effective_at: '2026-09-14 12:00:01' }, now)).toBe(false)
    expect(product_fit_consent_is_active({ ...consent, effective_at: '2026-09-14 11:59:59' }, now)).toBe(true)
  })
  it('binds consent to exactly one current profile revision', () => {
    const scope = { product_fit_profile_id: 2, profile_version: 3 }
    expect(product_fit_profile_is_covered(profile, scope, now)).toBe(true)
    expect(product_fit_profile_is_covered(profile, { ...scope, profile_version: 2 }, now)).toBe(false)
    expect(product_fit_profile_is_covered(profile, { ...scope, product_fit_profile_id: 3 }, now)).toBe(false)
    expect(product_fit_profile_is_covered({ ...profile, superseded_at: '2026-09-14T10:00:00Z' }, scope, now)).toBe(false)
    expect(product_fit_profile_is_covered({ ...profile, deleted_at: '2026-09-14T10:00:00Z' }, scope, now)).toBe(false)
  })
})
