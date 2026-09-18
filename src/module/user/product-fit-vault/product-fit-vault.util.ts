function parse_consent_timestamp(value: string) {
  const normalized = value.replace(' ', 'T')
  return Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(normalized) ? normalized + 'Z' : normalized)
}

export function product_fit_consent_is_active(
  consent:
    | {
        consent_status: string
        effective_at: string
        expires_at: string | null
        withdrawn_at: string | null
        deleted_at: string | null
      }
    | undefined,
  now = Date.now(),
) {
  if (!consent || consent.consent_status !== 'granted' || consent.withdrawn_at || consent.deleted_at) return false
  const effective = parse_consent_timestamp(consent.effective_at)
  const expires = consent.expires_at ? parse_consent_timestamp(consent.expires_at) : Infinity
  return Number.isFinite(effective) && effective <= now && expires > now
}

export function product_fit_profile_is_covered(
  profile:
    | { product_fit_profile_id: number; profile_version: number; deleted_at: string | null; superseded_at: string | null; effective_at: string }
    | undefined,
  consent: { product_fit_profile_id: number | null; profile_version: number | null },
  now = Date.now(),
) {
  return (
    !!profile &&
    !profile.deleted_at &&
    !profile.superseded_at &&
    parse_consent_timestamp(profile.effective_at) <= now &&
    profile.product_fit_profile_id === consent.product_fit_profile_id &&
    profile.profile_version === consent.profile_version
  )
}
