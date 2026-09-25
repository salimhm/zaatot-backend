import type { ai_tool_activity } from '@ai/runtime.ai'
import type { Static } from 'elysia'

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

import { $agent_investigator, agent_investigator } from '@agent/investigator/investigator.agent'

import { dto_boycott_decision } from '@module/main/boycott-decision/boycott-decision.dto'
import { service_boycott_decision } from '@module/main/boycott-decision/boycott-decision.service'
import { dto_boycott_provider } from '@module/main/boycott-provider/boycott-provider.dto'
import { service_boycott_provider } from '@module/main/boycott-provider/boycott-provider.service'

type local_response = Static<typeof dto_boycott_decision.decide.response>
type boycat_response = Static<typeof dto_boycott_provider.decide.response>

const local_unknown: local_response['data'] = {
  decision_status: 'unknown',
  confidence: 0,
  reason: 'No match in local knowledge.',
  matched_entity: null,
  matched_path: [],
  sources: [],
  alternatives: [],
}

const boycat_not_found: boycat_response['data'] = {
  provider: 'boycat',
  provider_status: 'not_found',
  decision_status: 'unknown',
  confidence: 0,
  reason: 'No match in Boycat.',
  matched_entity: null,
  campaigns: [],
  sources: [],
  alternatives: [],
}

function mock_extraction(entity_type: 'brand' | 'product' | 'unknown', entity_name: string | null) {
  spyOn($agent_investigator, 'generateText').mockResolvedValue({
    output: { entity_type, entity_name },
  } as Awaited<ReturnType<typeof $agent_investigator.generateText>>)
}

beforeEach(() => {
  spyOn(service_boycott_decision, 'decide').mockImplementation(async (): Promise<local_response> => ({ data: local_unknown }))
  spyOn(service_boycott_provider, 'decide').mockImplementation(async (): Promise<boycat_response> => ({ data: boycat_not_found }))
})

afterEach(() => {
  mock.restore()
})

describe('Investigator agent', () => {
  it('extracts the brand name from a natural-language request before both service calls', async () => {
    mock_extraction('brand', 'Coca Cola')

    const result = await agent_investigator({ query: 'info about Coca Cola' })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.subject.brand_name).toBe('Coca Cola')
    expect(result.data.subject.brand_candidates).toEqual(['Coca Cola'])
    expect(service_boycott_decision.decide).toHaveBeenCalledWith({ product_brand_name: 'Coca Cola', candidate_names: [] })
    expect(service_boycott_provider.decide).toHaveBeenCalledWith({ provider: 'boycat', brand_name: 'Coca Cola' })
  })

  it('requires a brand after extracting only a product name', async () => {
    mock_extraction('product', 'Choco Bar')

    const result = await agent_investigator({ query: 'investigate product Choco Bar' })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.subject).toEqual({ brand_name: null, brand_candidates: [], product_name: 'Choco Bar' })
    expect(result.data.status).toBe('needs_input')
    expect(service_boycott_decision.decide).not.toHaveBeenCalled()
    expect(service_boycott_provider.decide).not.toHaveBeenCalled()
  })

  it('rejects an extracted name that was not present in the request', async () => {
    mock_extraction('brand', 'Pepsi')

    const result = await agent_investigator({ query: 'info about Coca Cola' })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('needs_input')
    expect(service_boycott_decision.decide).not.toHaveBeenCalled()
    expect(service_boycott_provider.decide).not.toHaveBeenCalled()
  })

  it('treats structured provider labels as bounded brand candidates', async () => {
    const result = await agent_investigator({
      brand_name: 'Coca-Cola',
      brand_candidates: ['COCA-COLA SERVICES SA/NV', 'Coca-Cola'],
      product_name: 'Coca-Cola Original Taste',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('no_matching_evidence')
    expect(result.data.subject.brand_candidates).toEqual(['Coca-Cola', 'COCA-COLA SERVICES SA/NV'])
    expect(service_boycott_decision.decide).toHaveBeenCalledWith({
      product_brand_name: 'Coca-Cola',
      candidate_names: ['COCA-COLA SERVICES SA/NV'],
    })
    expect(service_boycott_provider.decide).toHaveBeenNthCalledWith(1, { provider: 'boycat', brand_name: 'Coca-Cola' })
    expect(service_boycott_provider.decide).toHaveBeenNthCalledWith(2, {
      provider: 'boycat',
      brand_name: 'COCA-COLA SERVICES SA/NV',
    })
  })

  it('reports cited local evidence without making a final verdict', async () => {
    spyOn(service_boycott_decision, 'decide').mockImplementation(() =>
      Promise.resolve({
        data: {
          ...local_unknown,
          decision_status: 'boycott',
          confidence: 92,
          matched_entity: {
            entity_type: 'brand',
            name: 'Example Brand',
            matched_name: 'Example Brand',
            match_type: 'exact',
            match_score: 100,
          },
          matched_path: ['input:Example Brand', 'brand:Example Brand'],
          sources: [{ source_name: 'Test source', source_url: 'https://example.org', url: 'https://example.org/evidence' }],
        },
      }),
    )

    const result = await agent_investigator({ brand_name: 'Example Brand' })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('evidence_found')
    expect(result.data.checks[0]?.citations[0]?.url).toBe('https://example.org/evidence')
    expect(result.data.limitations).not.toContain('No matching evidence is not proof that a brand is safe.')
    expect(result.data.analysis_draft).toBeNull()
  })

  it('does not interpret absent matches as proof of safety', async () => {
    const result = await agent_investigator({ brand_name: 'Example Brand' })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('no_matching_evidence')
    expect(result.data.limitations).toContain('No matching evidence is not proof that a brand is safe.')
  })

  it('uses the workflow tool budget, signal and Bait Tester for provider evidence', async () => {
    const signal = new AbortController().signal
    const use_tool_spy = mock(async (call: () => Promise<unknown>, _activity?: ai_tool_activity) => await call())
    const use_tool = async <T>(call: () => Promise<T>, activity?: ai_tool_activity): Promise<T> => (await use_tool_spy(call, activity)) as T
    const inspect_content = mock(async (text: string) => text)

    const result = await agent_investigator(
      { brand_name: 'Example Brand' },
      { signal, runtime: { use_tool, inspect_content }, include_analysis_draft: false },
    )

    expect(result.success).toBe(true)
    expect(use_tool_spy).toHaveBeenCalledTimes(2)
    expect(use_tool_spy.mock.calls.map((call) => call[1]?.title)).toEqual(['Checking local boycott knowledge', 'Checking Boycat evidence'])
    expect(service_boycott_provider.decide).toHaveBeenCalledWith({ provider: 'boycat', brand_name: 'Example Brand' }, signal)
    expect(inspect_content).toHaveBeenCalledWith(JSON.stringify(boycat_not_found))
  })

  it('does not call evidence services after workflow cancellation', async () => {
    const result = await agent_investigator({ brand_name: 'Example Brand' }, { signal: AbortSignal.abort() })

    expect(result.success).toBe(false)
    expect(service_boycott_decision.decide).not.toHaveBeenCalled()
    expect(service_boycott_provider.decide).not.toHaveBeenCalled()
  })

  it('reports an unavailable provider separately from no matching evidence', async () => {
    spyOn(service_boycott_provider, 'decide').mockImplementation(() =>
      Promise.resolve({ data: { ...boycat_not_found, provider_status: 'unavailable', reason: 'Provider unavailable.' } }),
    )

    const result = await agent_investigator({ brand_name: 'Example Brand' })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('unavailable')
    expect(result.data.checks[1]?.status).toBe('unavailable')
  })

  it('flags a matched result without citations for review', async () => {
    spyOn(service_boycott_provider, 'decide').mockImplementation(() =>
      Promise.resolve({
        data: {
          ...boycat_not_found,
          provider_status: 'matched',
          decision_status: 'unknown',
          confidence: 50,
          matched_entity: {
            entity_type: 'brand',
            name: 'Example Brand',
            matched_name: 'Example Brand',
            match_type: 'exact',
            match_score: 100,
          },
        },
      }),
    )

    const result = await agent_investigator({ brand_name: 'Example Brand' })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('needs_review')
  })

  it('requires review when Boycat cannot distinguish multiple brand identities', async () => {
    spyOn(service_boycott_provider, 'decide').mockImplementation(() =>
      Promise.resolve({
        data: {
          ...boycat_not_found,
          provider_status: 'ambiguous',
          reason: 'Multiple possible brand identities.',
          identity_candidates: ['Coca Cola', 'Coca-Cola'],
        },
      }),
    )

    const result = await agent_investigator({ brand_name: 'Coca-Cola' })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('needs_review')
    expect(result.data.checks[1]?.status).toBe('ambiguous')
    expect(result.data.limitations).toContain(
      'Boycat returned multiple possible brand identities; no provider claim was assigned to an unverified match.',
    )
  })

  it('does not treat Boycat’s generic home page as supporting evidence', async () => {
    spyOn(service_boycott_provider, 'decide').mockImplementation(() =>
      Promise.resolve({
        data: {
          ...boycat_not_found,
          provider_status: 'matched',
          decision_status: 'boycott',
          confidence: 90,
          matched_entity: {
            entity_type: 'brand',
            name: 'Example Brand',
            matched_name: 'Example Brand',
            match_type: 'exact',
            match_score: 100,
          },
          sources: [{ source_name: 'Boycat', source_url: 'https://boycat.io', url: 'https://boycat.io' }],
        },
      }),
    )

    const result = await agent_investigator({ brand_name: 'Example Brand' })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('needs_review')
    expect(result.data.limitations).toContain('At least one match has no specific supporting citation URL in the service response.')
  })

  it('requires review when candidates resolve to distinct verified brand identities', async () => {
    spyOn(service_boycott_provider, 'decide').mockImplementation(
      async ({ brand_name }): Promise<boycat_response> => ({
        data: {
          ...boycat_not_found,
          provider_status: 'matched',
          decision_status: 'boycott',
          confidence: 90,
          matched_entity: {
            entity_type: 'brand',
            name: brand_name!,
            matched_name: brand_name!,
            match_type: 'exact',
            match_score: 100,
          },
          sources: [{ source_name: 'Boycat', source_url: 'https://boycat.io', url: `https://boycat.io/brands/${brand_name}` }],
        },
      }),
    )

    const result = await agent_investigator({ brand_name: 'Brand One', brand_candidates: ['Brand One', 'Brand Two'] })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('needs_review')
    expect(result.data.checks.filter((check) => check.source === 'boycat')).toHaveLength(2)
    expect(result.data.limitations).toContain('Evidence sources matched more than one distinct brand identity; the identity requires review.')
  })
})
