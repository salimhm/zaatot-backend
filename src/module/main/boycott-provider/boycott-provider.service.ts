import { Buffer } from 'node:buffer'
import { createDecipheriv } from 'node:crypto'
import type { Static } from 'elysia'

import { dto_boycott_provider, enum_boycott_provider_name, enum_boycott_provider_status } from '@module/main/boycott-provider/boycott-provider.dto'

type boycott_provider_name = (typeof enum_boycott_provider_name)[number]

type boycott_provider_status = (typeof enum_boycott_provider_status)[number]

type boycat_campaign = {
  name?: string
  reasoning?: string
  source?: string
  created_at?: string
  tier?: {
    level?: number
    title?: string
    description?: string
  } | null
}

type boycat_search_result = {
  brand_name?: string
  campaign_tier?: number
  campaign_name?: string
}

type boycat_details_response = {
  success?: boolean
  result?: {
    details?: {
      id?: string
      name?: string
      created_at?: string
      campaigns?: boycat_campaign[]
    }
    alternative_brands?: {
      name?: string
      imgLink?: string
    }[]
  }
}

type boycat_search_response = {
  success?: boolean
  result?: boycat_search_result[]
}

const boycat_home_url = 'https://boycat.io'
const boycat_compliance_url = 'https://www.boycat.io/api/compliance'

function normalize_base64(value: string) {
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))

  return normalized + padding
}

function decode_base64(value: string) {
  return Buffer.from(normalize_base64(value), 'base64')
}

function decrypt_api_response_gcm(encrypted_payload: string, api_key: string) {
  const key = decode_base64(api_key)
  const encrypted_bytes = decode_base64(encrypted_payload)

  if (key.length !== 32 || encrypted_bytes.length <= 28) throw new Error('invalid-boycat-encrypted-payload')

  const iv = encrypted_bytes.subarray(0, 12)
  const tag = encrypted_bytes.subarray(encrypted_bytes.length - 16)
  const ciphertext = encrypted_bytes.subarray(12, encrypted_bytes.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)

  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

function parse_json(value: string): unknown {
  return JSON.parse(value)
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extract_encrypted_payload(value: unknown) {
  if (typeof value === 'string') return value
  if (!is_record(value)) return null

  for (const key of ['encrypted_payload', 'encryptedPayload', 'payload', 'data']) {
    if (typeof value[key] === 'string') return value[key]
  }

  return null
}

function parse_response_text(value: string): unknown {
  try {
    return parse_json(value)
  } catch {
    return value
  }
}

function get_decision_brand(body: Static<typeof dto_boycott_provider.decide.body>) {
  return (
    [body.brand_name, body.product_brand_name, body.product_name].find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() || ''
  )
}

function build_boycat_decision_url(brand_name: string) {
  const url = new URL(process.env.BOYCAT_COMPLIANCE_URL || boycat_compliance_url)

  url.searchParams.set('brand', encodeURIComponent(brand_name))

  return url.toString()
}

async function fetch_boycat_search_encrypted_payload(query: string) {
  const timeout_ms = Number(process.env.BOYCAT_TIMEOUT_MS || 8000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeout_ms)

  try {
    const response = await fetch(process.env.BOYCAT_COMPLIANCE_URL || boycat_compliance_url, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'SEARCH_BOYCOTTED_BRANDS',
        searchText: query,
      }),
      signal: controller.signal,
    })

    if (!response.ok) return null

    const response_text = await response.text()
    const parsed = parse_response_text(response_text)

    return extract_encrypted_payload(parsed)
  } finally {
    clearTimeout(timeout)
  }
}

async function fetch_boycat_details_encrypted_payload(brand_name: string) {
  const timeout_ms = Number(process.env.BOYCAT_TIMEOUT_MS || 8000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeout_ms)

  try {
    const response = await fetch(build_boycat_decision_url(brand_name), {
      method: 'GET',
      headers: {
        accept: 'application/json, text/plain, */*',
      },
      signal: controller.signal,
    })

    if (!response.ok) return null

    const response_text = await response.text()
    const parsed = parse_response_text(response_text)

    return extract_encrypted_payload(parsed)
  } finally {
    clearTimeout(timeout)
  }
}

function calculate_tier_confidence(tier_level: number | null) {
  if (tier_level === null) return 80
  if (tier_level <= 1) return 100
  if (tier_level === 2) return 90
  if (tier_level === 3) return 80

  return 70
}

function calculate_campaign_confidence(campaigns: boycat_campaign[]) {
  if (campaigns.length === 0) return 0

  const tier_levels = campaigns.map((campaign) => campaign.tier?.level).filter((level): level is number => typeof level === 'number')
  const best_level = tier_levels.length > 0 ? Math.min(...tier_levels) : null

  return calculate_tier_confidence(best_level)
}

function build_match_score(query: string, matched_name: string) {
  if (!query || !matched_name) return 0

  return query.toLowerCase().replace(/[^a-z0-9]/g, '') === matched_name.toLowerCase().replace(/[^a-z0-9]/g, '') ? 100 : 80
}

function get_decision_status_from_confidence(confidence: number) {
  return confidence >= 80 ? 'boycott' : 'needs_review'
}

function normalize_campaign(campaign: boycat_campaign): boycat_campaign {
  return {
    name: campaign.name,
    reasoning: campaign.reasoning,
    source: campaign.source,
    created_at: campaign.created_at,
    tier: campaign.tier
      ? {
          level: campaign.tier.level,
          title: campaign.tier.title,
          description: campaign.tier.description,
        }
      : campaign.tier,
  }
}

function build_search_empty_response(
  provider: boycott_provider_name,
  provider_status: boycott_provider_status,
  query: string,
): Static<typeof dto_boycott_provider.search.response> {
  return {
    data: {
      provider,
      provider_status,
      query,
      results: [],
    },
  }
}

function build_decision_empty_response(
  provider: boycott_provider_name,
  provider_status: boycott_provider_status,
  reason: string,
): Static<typeof dto_boycott_provider.decide.response> {
  return {
    data: {
      provider,
      provider_status,
      decision_status: 'unknown',
      confidence: 0,
      reason,
      matched_entity: null,
      campaigns: [],
      sources: [],
      alternatives: [],
    },
  }
}

function normalize_boycat_search_response(response: boycat_search_response, query: string): Static<typeof dto_boycott_provider.search.response> {
  const results = Array.isArray(response.result) ? response.result : []

  if (!response.success || results.length === 0) return build_search_empty_response('boycat', 'not_found', query)

  return {
    data: {
      provider: 'boycat',
      provider_status: 'matched',
      query,
      results: results
        .filter((item) => typeof item.brand_name === 'string' && item.brand_name.trim().length > 0)
        .map((item) => {
          const brand_name = item.brand_name?.trim() || ''
          const campaign_tier = typeof item.campaign_tier === 'number' ? item.campaign_tier : undefined
          const confidence = calculate_tier_confidence(campaign_tier ?? null)
          const decision_status = get_decision_status_from_confidence(confidence)
          const campaign_name = item.campaign_name || 'Boycat campaign'

          return {
            brand_name,
            campaign_name,
            campaign_tier,
            decision_status,
            confidence,
            reason: `Boycat returned ${campaign_name} campaign tier ${campaign_tier ?? 'unknown'} for ${brand_name}.`,
          }
        }),
    },
  }
}

function normalize_boycat_details_response(
  response: boycat_details_response,
  brand_name: string,
): Static<typeof dto_boycott_provider.decide.response> {
  const details = response.result?.details
  const name = details?.name?.trim()

  if (!response.success || !details || !name) {
    return build_decision_empty_response('boycat', 'not_found', 'Boycat did not return details for this brand or product.')
  }

  const campaigns = (details.campaigns || []).map(normalize_campaign)
  const confidence = calculate_campaign_confidence(campaigns)
  const first_campaign = campaigns[0]
  const match_score = build_match_score(brand_name, name)

  if (campaigns.length === 0) {
    return {
      data: {
        provider: 'boycat',
        provider_status: 'matched',
        decision_status: 'unknown',
        confidence: 50,
        reason: `Boycat returned ${name}, but did not return campaign evidence. Treat this as unknown until another source confirms the status.`,
        matched_entity: {
          entity_type: 'brand',
          name,
          matched_name: brand_name,
          match_type: match_score === 100 ? 'exact' : 'fuzzy',
          match_score,
        },
        campaigns,
        sources: [],
        alternatives: (response.result?.alternative_brands || [])
          .filter((alternative) => alternative.name)
          .map((alternative) => ({
            name: alternative.name || '',
            image_url: alternative.imgLink,
            description: 'Boycat alternative brand',
          })),
      },
    }
  }

  return {
    data: {
      provider: 'boycat',
      provider_status: 'matched',
      decision_status: get_decision_status_from_confidence(confidence),
      confidence,
      reason: first_campaign?.reasoning || 'Boycat returned active campaign evidence for this brand.',
      matched_entity: {
        entity_type: 'brand',
        name,
        matched_name: brand_name,
        match_type: match_score === 100 ? 'exact' : 'fuzzy',
        match_score,
      },
      campaigns,
      sources: campaigns.map((campaign) => ({
        source_name: 'Boycat',
        source_url: boycat_home_url,
        title: campaign.name || 'Boycat campaign',
        url: campaign.source || boycat_home_url,
        quote: campaign.reasoning,
      })),
      alternatives: (response.result?.alternative_brands || [])
        .filter((alternative) => alternative.name)
        .map((alternative) => ({
          name: alternative.name || '',
          image_url: alternative.imgLink,
          description: 'Boycat alternative brand',
        })),
    },
  }
}

async function decrypt_boycat_payload<T>(encrypted_payload: string) {
  if (!process.env.BOYCAT_API_KEY) return null

  const decrypted = decrypt_api_response_gcm(encrypted_payload, process.env.BOYCAT_API_KEY)

  return parse_json(decrypted) as T
}

async function load_boycat_search_response(query: string) {
  if (!process.env.BOYCAT_API_KEY) return null

  const encrypted_payload = await fetch_boycat_search_encrypted_payload(query)
  if (!encrypted_payload) return null

  return await decrypt_boycat_payload<boycat_search_response>(encrypted_payload)
}

async function load_boycat_details_response(brand_name: string) {
  if (!process.env.BOYCAT_API_KEY) return null

  const encrypted_payload = await fetch_boycat_details_encrypted_payload(brand_name)
  if (!encrypted_payload) return null

  return await decrypt_boycat_payload<boycat_details_response>(encrypted_payload)
}

export const service_boycott_provider = {
  async search(body: Static<typeof dto_boycott_provider.search.body>): Promise<Static<typeof dto_boycott_provider.search.response>> {
    const provider = body.provider || 'boycat'
    const query = body.query.trim()

    try {
      const response = await load_boycat_search_response(query)

      if (!response) return build_search_empty_response(provider, 'unavailable', query)

      return normalize_boycat_search_response(response, query)
    } catch {
      return build_search_empty_response(provider, 'invalid_response', query)
    }
  },

  async decide(body: Static<typeof dto_boycott_provider.decide.body>): Promise<Static<typeof dto_boycott_provider.decide.response>> {
    const provider = body.provider || 'boycat'
    const brand_name = get_decision_brand(body)

    if (!brand_name)
      return build_decision_empty_response(
        provider,
        'not_found',
        'A brand name, product brand name, or product name is required for provider decision.',
      )

    try {
      const response = await load_boycat_details_response(brand_name)

      if (!response) {
        return build_decision_empty_response(
          provider,
          'unavailable',
          'Boycat compliance API is not configured or did not return a usable encrypted response. Configure BOYCAT_API_KEY and optionally BOYCAT_COMPLIANCE_URL.',
        )
      }

      return normalize_boycat_details_response(response, brand_name)
    } catch {
      return build_decision_empty_response(
        provider,
        'invalid_response',
        'Provider returned a response that could not be parsed, decrypted, or normalized.',
      )
    }
  },
}
