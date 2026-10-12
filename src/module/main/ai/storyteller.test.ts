import type { type_schema_input_agent_storyteller } from '@agent/storyteller/storyteller.schema.agent'

import { describe, expect, it, spyOn } from 'bun:test'

import { adapter_storyteller, build_storyteller_input } from '@ai/adapter/storyteller.adapter.ai'
import { $agent_storyteller, agent_storyteller, finalize_storyteller_output } from '@agent/storyteller/storyteller.agent'
import { schema_agent_storyteller } from '@agent/storyteller/storyteller.schema.agent'

const input: type_schema_input_agent_storyteller = {
  request: 'Should I boycott Example Cola?',
  subject: { type: 'brand', name: 'Example Cola', brand: 'Example Cola', barcode: null },
  decision: 'restrict',
  decision_summary: 'The evidence may be explained only with its qualification.',
  accepted_claims: [
    {
      id: 'investigator.checks[0]',
      text: 'A checked source matched Example Cola with a boycott decision.',
      qualification: 'This is sourced evidence rather than an independent final judgment.',
      citation_ids: ['investigator-source-1'],
    },
  ],
  excluded_claims: [{ id: 'claim-unsafe', reason: 'The claim was not supported.' }],
  constraints: [{ code: 'qualify-evidence', action: 'qualify', message: 'Preserve the evidence qualification.' }],
  limitations: ['Only the checked sources are represented.'],
  sources: [{ id: 'investigator-source-1', provider: 'Example Provider' }],
  repair_feedback: [],
}

const draft = {
  schema_version: 1 as const,
  summary: 'The checked sources contain boycott-related evidence for Example Cola, with important limitations.',
  selected_claim_ids: ['investigator.checks[0]'],
}

describe('Storyteller boundaries', () => {
  it('resolves only reviewed claims and preserves their qualification, constraints, limitations and citations', () => {
    expect(finalize_storyteller_output(input, draft)).toEqual({
      schema_version: 1,
      summary: draft.summary,
      reasons: [
        'A checked source matched Example Cola with a boycott decision. Qualification: This is sourced evidence rather than an independent final judgment.',
      ],
      tradeoffs: ['Preserve the evidence qualification.', 'Only the checked sources are represented.'],
      citation_ids: ['investigator-source-1'],
    })
  })

  it('rejects unsupported or excluded claim selections', () => {
    expect(() => finalize_storyteller_output(input, { ...draft, selected_claim_ids: ['claim-unsafe'] })).toThrow('unsupported claim')
    expect(() => finalize_storyteller_output(input, { ...draft, selected_claim_ids: ['invented-claim'] })).toThrow('unsupported claim')
  })

  it('validates model output and honors cancellation', async () => {
    const generate = spyOn($agent_storyteller, 'generateText')
    try {
      generate.mockResolvedValue({ output: draft } as Awaited<ReturnType<typeof $agent_storyteller.generateText>>)
      expect(await agent_storyteller(input)).toEqual({ success: true, data: finalize_storyteller_output(input, draft) })

      generate.mockResolvedValue({ output: { ...draft, selected_claim_ids: ['invented-claim'] } } as Awaited<
        ReturnType<typeof $agent_storyteller.generateText>
      >)
      expect((await agent_storyteller(input)).success).toBe(false)

      const cancelled = new AbortController()
      cancelled.abort()
      generate.mockClear()
      expect((await agent_storyteller(input, cancelled.signal)).success).toBe(false)
      expect(generate).not.toHaveBeenCalled()
    } finally {
      generate.mockRestore()
    }
  })
})

describe('Storyteller workflow adapter', () => {
  const skeptic = {
    status: 'reviewed' as const,
    accepted_claims: [
      {
        claim_ref: 'investigator.checks[0]',
        claim: 'A checked source matched Example Cola with a boycott decision.',
        evidence_refs: ['investigator.checks[0]'],
        qualification: 'Keep the source limitation visible.',
      },
    ],
    unsupported_claims: [],
    stale_sources: [],
    uncertainties: [],
    targeted_rechecks: [],
  }
  const referee = {
    schema_version: 1 as const,
    decision: 'pass' as const,
    summary: 'The reviewed claim may proceed.',
    constraints: [],
    disagreements: [],
    excluded_items: [],
    limitations: [],
  }

  it('builds a closed presentation input from validated review results', () => {
    const mapped = build_storyteller_input({
      prompt: 'Should I boycott Example Cola?',
      dependencies: {
        Skeptic: { status: 'completed', output: skeptic, limitations: [] },
        Referee: { status: 'completed', output: referee, limitations: [] },
      },
    })

    expect(mapped).toMatchObject({
      request: 'Should I boycott Example Cola?',
      decision: 'pass',
      subject: null,
      accepted_claims: [{ id: 'investigator.checks[0]', citation_ids: [] }],
    })
  })

  it('returns a validated shared workflow envelope', async () => {
    const generate = spyOn($agent_storyteller, 'generateText')
    try {
      generate.mockResolvedValue({ output: draft } as Awaited<ReturnType<typeof $agent_storyteller.generateText>>)
      const result = await adapter_storyteller(
        {
          prompt: input.request,
          execution_id: crypto.randomUUID(),
          dependencies: {
            Skeptic: { status: 'completed', output: skeptic, limitations: [] },
            Referee: { status: 'completed', output: referee, limitations: [] },
          },
          candidate_review: null,
          budgets: {
            timeout_ms: 10_000,
            max_tool_calls: 0,
            max_retries: 0,
            max_alternative_candidates: 0,
            max_candidate_review_passes: 0,
            max_response_repairs: 0,
          },
          use_tool: async (call) => await call(),
          inspect_content: async (text) => text,
        },
        new AbortController().signal,
      )

      expect(result.status).toBe('completed')
      expect(schema_agent_storyteller.parse(result.output).reasons).toEqual([
        'A checked source matched Example Cola with a boycott decision. Qualification: Keep the source limitation visible.',
      ])
    } finally {
      generate.mockRestore()
    }
  })
})
