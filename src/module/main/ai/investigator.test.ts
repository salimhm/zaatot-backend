import type { investigator_runtime } from '@agent/investigator/investigator.agent'

import { describe, expect, it, mock, spyOn } from 'bun:test'

import { $agent_investigator, agent_investigator } from '@agent/investigator/investigator.agent'

import { service_boycott_decision } from '@module/main/boycott-decision/boycott-decision.service'
import { service_boycott_provider } from '@module/main/boycott-provider/boycott-provider.service'

type local_data = Awaited<ReturnType<typeof service_boycott_decision.decide>>['data']
type boycat_data = Awaited<ReturnType<typeof service_boycott_provider.decide>>['data']

const local_not_found = {
  decision_status: 'unknown',
  confidence: 0,
  reason: 'No local match.',
  matched_entity: null,
  matched_path: [],
  sources: [],
  alternatives: [],
} as unknown as local_data

const boycat_not_found = {
  provider: 'boycat',
  provider_status: 'not_found',
  decision_status: 'unknown',
  confidence: 0,
  reason: 'No Boycat match.',
  matched_entity: null,
  campaigns: [],
  sources: [],
  alternatives: [],
} as unknown as boycat_data

const boycat_match = (overrides: { decision_status?: string; match_type?: string; name?: string } = {}) =>
  ({
    ...boycat_not_found,
    provider_status: 'matched',
    decision_status: overrides.decision_status ?? 'boycott',
    confidence: 90,
    reason: 'Active campaign.',
    matched_entity: {
      entity_type: 'brand',
      name: overrides.name ?? 'Example',
      matched_name: 'Example',
      match_type: overrides.match_type ?? 'exact',
      match_score: 100,
    },
    campaigns: [{ name: 'Campaign', reasoning: 'Reason', source: 'https://example.com/campaign', created_at: '2025-05-01T00:00:00.000Z' }],
    sources: [{ source_name: 'Boycat', source_url: 'https://boycat.io', title: 'Campaign', url: 'https://example.com/campaign', quote: 'Reason' }],
  }) as unknown as boycat_data

const with_services = async (boycat: boycat_data | (() => Promise<never>), run: () => Promise<void>, local: local_data = local_not_found) => {
  const decide_local = spyOn(service_boycott_decision, 'decide').mockResolvedValue({ data: local })
  const decide_boycat =
    typeof boycat === 'function'
      ? spyOn(service_boycott_provider, 'decide').mockImplementation(boycat)
      : spyOn(service_boycott_provider, 'decide').mockResolvedValue({ data: boycat })
  try {
    await run()
  } finally {
    decide_local.mockRestore()
    decide_boycat.mockRestore()
  }
}

const runtime = () => {
  const use_tool = mock(async (call: () => Promise<unknown>) => call())
  const inspect_content = mock(async (text: string) => text)
  return { use_tool, inspect_content, runtime: { use_tool: use_tool as investigator_runtime['use_tool'], inspect_content } }
}

describe('Investigator evidence status', () => {
  it('reports sourced evidence, keeps campaign dates, and charges every lookup to the shared budget', async () => {
    await with_services(boycat_match(), async () => {
      const tools = runtime()
      const result = await agent_investigator({ brand_name: 'Example', brand_candidates: ['Example'] }, { runtime: tools.runtime })
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.status).toBe('evidence_found')
      expect(result.data.checks[1]!.citations[0]!.published_at).toBe('2025-05-01T00:00:00.000Z')
      expect(tools.use_tool).toHaveBeenCalledTimes(2)
      expect(tools.inspect_content).toHaveBeenCalledTimes(1)
    })
  })

  it('never treats a missing match as proof', async () => {
    await with_services(boycat_not_found, async () => {
      const result = await agent_investigator({ brand_name: 'Example' })
      expect(result.success && result.data.status).toBe('no_matching_evidence')
      expect(result.success && result.data.limitations[0]).toBe('No matching evidence is not proof that a brand is safe.')
    })
  })

  for (const [label, overrides, limitation] of [
    ['a fuzzy identity match', { match_type: 'fuzzy' }, 'fuzzy or follows a related-entity path'],
    ['low-confidence provider evidence', { decision_status: 'needs_review' }, 'low-confidence evidence'],
  ] as const) {
    it(`requires review for ${label}`, async () => {
      await with_services(boycat_match(overrides), async () => {
        const result = await agent_investigator({ brand_name: 'Example' })
        expect(result.success && result.data.status).toBe('needs_review')
        expect(result.success && result.data.limitations.join(' ')).toContain(limitation)
      })
    })
  }

  it('requires review when sources disagree about the verdict', async () => {
    const local = {
      ...local_not_found,
      decision_status: 'not_boycotted',
      confidence: 80,
      matched_entity: { entity_type: 'brand', name: 'Example', matched_name: 'Example', match_type: 'exact', match_score: 100 },
      sources: [{ source_name: 'Local', source_url: 'https://example.com', url: 'https://example.com/local' }],
    } as unknown as local_data
    await with_services(
      boycat_match(),
      async () => {
        const result = await agent_investigator({ brand_name: 'Example' })
        expect(result.success && result.data.status).toBe('needs_review')
      },
      local,
    )
  })

  it('reports an unavailable provider instead of an absence of evidence', async () => {
    await with_services(
      async () => {
        throw new Error('Provider down')
      },
      async () => {
        const result = await agent_investigator({ brand_name: 'Example' })
        expect(result.success && result.data.status).toBe('unavailable')
        expect(result.success && result.data.checks.map((check) => check.status)).toEqual(['not_found', 'unavailable'])
      },
    )
  })

  it('does not consume provider content that Bait Tester rejects or changes', async () => {
    await with_services(boycat_match(), async () => {
      for (const inspect_content of [
        mock(async () => {
          throw new Error('Rejected by Bait Tester')
        }),
        mock(async (text: string) => `${text} changed`),
      ]) {
        const result = await agent_investigator({ brand_name: 'Example' }, { runtime: { use_tool: async (call) => call(), inspect_content } })
        expect(result.success).toBe(false)
      }
    })
  })

  it('asks for a brand instead of substituting the product name', async () => {
    await with_services(boycat_not_found, async () => {
      const result = await agent_investigator({ brand_name: null, brand_candidates: [], product_name: 'Cola' })
      expect(result.success && result.data.status).toBe('needs_input')
      expect(result.success && result.data.checks).toEqual([])
    })
  })

  it('does not start a cancelled investigation', async () => {
    const controller = new AbortController()
    controller.abort()
    const generate = spyOn($agent_investigator, 'generateText')
    await with_services(boycat_not_found, async () => {
      const result = await agent_investigator({ query: 'Investigate Example' }, { signal: controller.signal })
      expect(result.success).toBe(false)
      expect(generate).not.toHaveBeenCalled()
      expect(service_boycott_decision.decide).not.toHaveBeenCalled()
    })
    generate.mockRestore()
  })
})
