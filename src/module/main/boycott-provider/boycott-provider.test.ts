import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { Buffer } from 'node:buffer'
import { createCipheriv } from 'node:crypto'

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
