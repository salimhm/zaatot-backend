import { Buffer } from 'node:buffer'
import { createCipheriv } from 'node:crypto'

import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'

import { service_boycott_provider } from '@module/main/boycott-provider/boycott-provider.service'

const original_boycat_api_key = process.env.BOYCAT_API_KEY
const original_boycat_compliance_url = process.env.BOYCAT_COMPLIANCE_URL

function encrypt_payload(payload: unknown, base64_key: string) {
  const key = Buffer.from(`${base64_key}${'='.repeat((4 - (base64_key.length % 4)) % 4)}`, 'base64')
  const iv = Buffer.alloc(12, 1)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return Buffer.concat([iv, ciphertext, tag]).toString('base64')
}

const boycat_details_payload = {
  success: true,
  result: {
    details: {
      id: 'brand-id',
      name: 'Coca Cola',
      created_at: '2024-03-02T22:52:54.940898+00:00',
      campaigns: [
        {
          name: 'Watermelon',
          reasoning: 'The Coca-Cola Company owns Coca Cola.',
          source: 'https://example.com/source',
          created_at: '2024-03-02T22:52:55.056759+00:00',
          tier: {
            level: 1,
            title: 'Official BDS Priority Campaign',
            description: 'Priority campaign',
          },
        },
      ],
    },
    alternative_brands: [
      { name: 'Adirondack', imgLink: 'https://example.com/adirondack.png' },
      { name: 'Barr Soda', imgLink: 'https://example.com/barr.png' },
    ],
  },
}

const boycat_search_payload = {
  success: true,
  result: [
    { brand_name: 'Coca Cola', campaign_tier: 1, campaign_name: 'Watermelon' },
    { brand_name: 'Cocio', campaign_tier: 2, campaign_name: 'Watermelon' },
    { brand_name: 'Cocoa Puffs', campaign_tier: 2, campaign_name: 'Watermelon' },
  ],
}

afterEach(() => {
  process.env.BOYCAT_API_KEY = original_boycat_api_key
  process.env.BOYCAT_COMPLIANCE_URL = original_boycat_compliance_url
  mock.restore()
})

describe('Boycott Provider Service', () => {
  it('should search Boycat and return all matching brand candidates', async () => {
    const api_key = Buffer.alloc(32, 7).toString('base64').replace(/=+$/, '')
    process.env.BOYCAT_API_KEY = api_key
    process.env.BOYCAT_COMPLIANCE_URL = 'https://boycat.test/api/compliance'

    const spy_fetch = spyOn(globalThis, 'fetch').mockImplementation((() =>
      Promise.resolve(new Response(JSON.stringify(encrypt_payload(boycat_search_payload, api_key)), { status: 200 }))) as any)

    const result = await service_boycott_provider.search({ provider: 'boycat', query: 'coc' })

    expect(result.data.provider_status).toBe('matched')
    expect(result.data.results).toHaveLength(3)
    expect(result.data.results.map((item) => item.brand_name)).toEqual(['Coca Cola', 'Cocio', 'Cocoa Puffs'])
    expect(result.data.results[0]?.decision_status).toBe('boycott')
    expect(result.data.results[0]?.confidence).toBe(100)
    expect(spy_fetch).toHaveBeenCalledWith(
      'https://boycat.test/api/compliance',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          type: 'SEARCH_BOYCOTTED_BRANDS',
          searchText: 'coc',
        }),
      }),
    )
  })

  it('should fetch Boycat details and normalize a selected brand decision', async () => {
    const api_key = Buffer.alloc(32, 7).toString('base64').replace(/=+$/, '')
    process.env.BOYCAT_API_KEY = api_key
    process.env.BOYCAT_COMPLIANCE_URL = 'https://boycat.test/api/compliance'

    const spy_fetch = spyOn(globalThis, 'fetch').mockImplementation((() =>
      Promise.resolve(new Response(JSON.stringify(encrypt_payload(boycat_details_payload, api_key)), { status: 200 }))) as any)

    const result = await service_boycott_provider.decide({ provider: 'boycat', brand_name: 'Coca Cola' })

    expect(result.data.provider).toBe('boycat')
    expect(result.data.provider_status).toBe('matched')
    expect(result.data.requested_name).toBe('Coca Cola')
    expect(result.data.provider_matched_name).toBe('Coca Cola')
    expect(result.data.decision_status).toBe('boycott')
    expect(result.data.confidence).toBe(100)
    expect(result.data.reason).toBe('The Coca-Cola Company owns Coca Cola.')
    expect(result.data.sources[0]?.url).toBe('https://example.com/source')
    expect(result.data.alternatives[0]?.name).toBe('Adirondack')
    expect(spy_fetch).toHaveBeenCalledWith(
      'https://boycat.test/api/compliance?brand=Coca%2520Cola',
      expect.objectContaining({
        method: 'GET',
      }),
    )
  })

  it('resolves a uniquely matching provider spelling before requesting its details', async () => {
    const api_key = Buffer.alloc(32, 7).toString('base64').replace(/=+$/, '')
    process.env.BOYCAT_API_KEY = api_key
    process.env.BOYCAT_COMPLIANCE_URL = 'https://boycat.test/api/compliance'
    const absent = { success: false, result: null }
    const calls: string[] = []
    const spy_fetch = spyOn(globalThis, 'fetch').mockImplementation((async (input, init) => {
      const url = String(input)
      calls.push(`${init?.method} ${url}`)
      const payload = init?.method === 'POST' ? boycat_search_payload : url.includes('Coca-Cola') ? absent : boycat_details_payload
      return new Response(JSON.stringify(encrypt_payload(payload, api_key)), { status: 200 })
    }) as typeof fetch)

    const result = await service_boycott_provider.decide({ provider: 'boycat', brand_name: 'Coca-Cola' })

    expect(result.data.provider_status).toBe('matched')
    expect(result.data.requested_name).toBe('Coca-Cola')
    expect(result.data.provider_matched_name).toBe('Coca Cola')
    expect(result.data.matched_entity?.match_type).toBe('alias')
    expect(result.data.matched_entity?.matched_name).toBe('Coca-Cola')
    expect(calls).toEqual([
      'GET https://boycat.test/api/compliance?brand=Coca-Cola',
      'POST https://boycat.test/api/compliance',
      'GET https://boycat.test/api/compliance?brand=Coca%2520Cola',
    ])
    expect(spy_fetch.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ type: 'SEARCH_BOYCOTTED_BRANDS', searchText: 'Coca Cola' }))
  })

  it('searches after an HTTP 404 from direct details instead of assuming the brand is absent', async () => {
    const api_key = Buffer.alloc(32, 7).toString('base64').replace(/=+$/, '')
    process.env.BOYCAT_API_KEY = api_key
    process.env.BOYCAT_COMPLIANCE_URL = 'https://boycat.test/api/compliance'
    let get_calls = 0
    const spy_fetch = spyOn(globalThis, 'fetch').mockImplementation((async (_input, init) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify(encrypt_payload(boycat_search_payload, api_key)), { status: 200 })
      }
      get_calls++
      return get_calls === 1
        ? new Response(null, { status: 404 })
        : new Response(JSON.stringify(encrypt_payload(boycat_details_payload, api_key)), { status: 200 })
    }) as typeof fetch)

    const result = await service_boycott_provider.decide({ provider: 'boycat', brand_name: 'Coca-Cola' })

    expect(result.data.provider_status).toBe('matched')
    expect(result.data.provider_matched_name).toBe('Coca Cola')
    expect(spy_fetch).toHaveBeenCalledTimes(3)
  })

  it('does not use Boycat claims when two provider spellings match the same identity key', async () => {
    const api_key = Buffer.alloc(32, 7).toString('base64').replace(/=+$/, '')
    process.env.BOYCAT_API_KEY = api_key
    process.env.BOYCAT_COMPLIANCE_URL = 'https://boycat.test/api/compliance'
    const spy_fetch = spyOn(globalThis, 'fetch').mockImplementation((async (_input, init) => {
      const payload =
        init?.method === 'POST'
          ? { success: true, result: [{ brand_name: 'Coca Cola' }, { brand_name: 'Coca-Cola' }] }
          : { success: false, result: null }
      return new Response(JSON.stringify(encrypt_payload(payload, api_key)), { status: 200 })
    }) as typeof fetch)

    const result = await service_boycott_provider.decide({ provider: 'boycat', brand_name: 'Coca-Cola' })

    expect(result.data.provider_status).toBe('ambiguous')
    expect(result.data.decision_status).toBe('unknown')
    expect(result.data.matched_entity).toBeNull()
    expect(result.data.sources).toEqual([])
    expect(result.data.identity_candidates).toEqual(['Coca Cola', 'Coca-Cola'])
    expect(spy_fetch).toHaveBeenCalledTimes(2)
  })

  it('does not erase meaningful symbols to force a different brand match', async () => {
    const api_key = Buffer.alloc(32, 7).toString('base64').replace(/=+$/, '')
    process.env.BOYCAT_API_KEY = api_key
    process.env.BOYCAT_COMPLIANCE_URL = 'https://boycat.test/api/compliance'
    const spy_fetch = spyOn(globalThis, 'fetch').mockImplementation((async (_input, init) => {
      const payload = init?.method === 'POST' ? { success: true, result: [{ brand_name: 'HM' }] } : { success: false, result: null }
      return new Response(JSON.stringify(encrypt_payload(payload, api_key)), { status: 200 })
    }) as typeof fetch)

    const result = await service_boycott_provider.decide({ provider: 'boycat', brand_name: 'H&M' })

    expect(result.data.provider_status).toBe('not_found')
    expect(result.data.matched_entity).toBeNull()
    expect(spy_fetch).toHaveBeenCalledTimes(2)
  })

  it('compares apostrophes and accents without changing the displayed brand name', async () => {
    const api_key = Buffer.alloc(32, 7).toString('base64').replace(/=+$/, '')
    process.env.BOYCAT_API_KEY = api_key
    process.env.BOYCAT_COMPLIANCE_URL = 'https://boycat.test/api/compliance'
    let get_calls = 0
    const spy_fetch = spyOn(globalThis, 'fetch').mockImplementation((async (_input, init) => {
      if (init?.method !== 'POST') get_calls++
      const payload =
        init?.method === 'POST'
          ? { success: true, result: [{ brand_name: "L'Oreal" }] }
          : get_calls === 1
            ? { success: false, result: null }
            : { success: true, result: { details: { name: "L'Oreal", campaigns: [] } } }
      return new Response(JSON.stringify(encrypt_payload(payload, api_key)), { status: 200 })
    }) as typeof fetch)

    const result = await service_boycott_provider.decide({ provider: 'boycat', brand_name: "L'Oréal" })

    expect(result.data.provider_status).toBe('matched')
    expect(result.data.requested_name).toBe("L'Oréal")
    expect(result.data.provider_matched_name).toBe("L'Oreal")
    expect(result.data.matched_entity?.match_type).toBe('alias')
    expect(spy_fetch).toHaveBeenCalledTimes(3)
  })

  it('should return unknown when Boycat details have no campaign evidence', async () => {
    const api_key = Buffer.alloc(32, 7).toString('base64').replace(/=+$/, '')
    process.env.BOYCAT_API_KEY = api_key
    process.env.BOYCAT_COMPLIANCE_URL = 'https://boycat.test/api/compliance'

    spyOn(globalThis, 'fetch').mockImplementation((() =>
      Promise.resolve(
        new Response(
          encrypt_payload(
            {
              success: true,
              result: {
                details: { name: 'Neutral Brand', campaigns: [] },
                alternative_brands: [],
              },
            },
            api_key,
          ),
          { status: 200 },
        ),
      )) as any)

    const result = await service_boycott_provider.decide({ provider: 'boycat', brand_name: 'Neutral Brand' })

    expect(result.data.provider_status).toBe('matched')
    expect(result.data.decision_status).toBe('unknown')
    expect(result.data.confidence).toBe(50)
  })

  it('should return unavailable when Boycat is not configured', async () => {
    delete process.env.BOYCAT_COMPLIANCE_URL
    delete process.env.BOYCAT_API_KEY

    const search_result = await service_boycott_provider.search({ provider: 'boycat', query: 'coc' })
    const decision_result = await service_boycott_provider.decide({ provider: 'boycat', brand_name: 'Coca Cola' })

    expect(search_result.data.provider_status).toBe('unavailable')
    expect(search_result.data.results).toEqual([])
    expect(decision_result.data.provider_status).toBe('unavailable')
    expect(decision_result.data.decision_status).toBe('unknown')
  })
})
