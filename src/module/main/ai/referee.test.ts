import { describe, expect, it, spyOn } from 'bun:test'
import type { type_schema_agent_referee, type_schema_input_agent_referee } from '@agent/referee/referee.schema.agent'

import { adapter_referee, build_referee_input } from '@ai/adapter/referee.adapter.ai'
import { $agent_referee, agent_referee, validate_referee_output } from '@agent/referee/referee.agent'
import { schema_agent_referee, schema_input_agent_referee } from '@agent/referee/referee.schema.agent'

const input: type_schema_input_agent_referee = {
  request: 'Can I use this product with a milk allergy?',
  subject: { type: 'product', name: 'Example chocolate', brand: 'Example', barcode: '12345678' },
  findings: [
    {
      id: 'medic-finding-1',
      agent: 'Medic',
      topic: 'health',
      status: 'completed',
      claims: [
        {
          id: 'claim-milk-conflict',
          text: 'The label declares milk and conflicts with the supplied restriction.',
          evidence_refs: ['label.allergens.milk'],
        },
      ],
      required_constraints: [
        {
          code: 'preserve-allergen-conflict',
          severity: 'critical',
          action: 'exclude',
          message: 'Do not recommend the product as compatible with the supplied milk allergy.',
          applies_to: ['health recommendation'],
          source_refs: ['claim-milk-conflict'],
        },
      ],
      limitations: [],
    },
  ],
  skeptic: {
    status: 'completed',
    accepted_claim_ids: ['claim-milk-conflict'],
    qualified_claim_ids: [],
    rejected_claim_ids: [],
    conflicts: [],
    uncertainties: [],
    limitations: [],
  },
  policy_constraints: [],
  candidate_ids: [],
}

const restricted: type_schema_agent_referee = {
  schema_version: 1,
  decision: 'restrict',
  summary: 'The supported allergen conflict must restrict the downstream recommendation.',
  constraints: [
    {
      code: 'preserve-allergen-conflict',
      severity: 'critical',
      action: 'exclude',
      message: 'Do not recommend the product as compatible with the supplied milk allergy.',
      applies_to: ['health recommendation'],
      source_refs: ['claim-milk-conflict'],
    },
  ],
  disagreements: [],
  excluded_items: [],
  limitations: [],
}

describe('Referee decision boundaries', () => {
  it('requires restrictive decisions to include a corresponding constraint', () => {
    expect(schema_agent_referee.safeParse({ ...restricted, constraints: [] }).success).toBe(false)
    expect(schema_agent_referee.safeParse({ ...restricted, decision: 'pass' }).success).toBe(false)
  })

  it('rejects invented references and excluded items', () => {
    expect(() =>
      validate_referee_output(input, {
        ...restricted,
        constraints: restricted.constraints.map((constraint) => ({ ...constraint, source_refs: ['invented-source'] })),
      }),
    ).toThrow('unsupported source reference')
    expect(() => validate_referee_output(input, { ...restricted, excluded_items: [{ id: 'invented-item', reason: 'Unsupported.' }] })).toThrow(
      'unsupported excluded item ID',
    )
    expect(() =>
      validate_referee_output(input, {
        ...restricted,
        excluded_items: [{ id: 'claim-milk-conflict', reason: 'An accepted adverse claim must remain visible.' }],
      }),
    ).toThrow('unsupported excluded item ID')
  })

  it('preserves required constraints without weakening their action', () => {
    expect(validate_referee_output(input, restricted)).toEqual(restricted)
    expect(() => validate_referee_output(input, { ...restricted, constraints: [] })).toThrow('omitted required constraint')
    expect(() =>
      validate_referee_output(input, {
        ...restricted,
        constraints: restricted.constraints.map((constraint) => ({ ...constraint, action: 'qualify' as const })),
      }),
    ).toThrow('weakened required constraint')
  })

  it('requires review when Skeptic has not completed its review', () => {
    const incomplete = { ...input, skeptic: input.skeptic ? { ...input.skeptic, status: 'partial' as const } : null }
    expect(() => validate_referee_output(incomplete, restricted)).toThrow('Skeptic is incomplete')
  })

  it('validates generated output before returning success', async () => {
    const generate = spyOn($agent_referee, 'generateText')
    try {
      generate.mockResolvedValue({ output: restricted } as Awaited<ReturnType<typeof $agent_referee.generateText>>)
      expect(await agent_referee(input)).toEqual({ success: true, data: restricted })

      generate.mockResolvedValue({
        output: {
          ...restricted,
          constraints: restricted.constraints.map((constraint) => ({ ...constraint, source_refs: ['invented-source'] })),
        },
      } as Awaited<ReturnType<typeof $agent_referee.generateText>>)
      expect((await agent_referee(input)).success).toBe(false)
    } finally {
      generate.mockRestore()
    }
  })

  it('does not start or return a cancelled decision', async () => {
    const generate = spyOn($agent_referee, 'generateText')
    try {
      const cancelled = new AbortController()
      cancelled.abort()
      expect((await agent_referee(input, cancelled.signal)).success).toBe(false)
      expect(generate).not.toHaveBeenCalled()

      const late = new AbortController()
      generate.mockImplementation(async () => {
        late.abort()
        return { output: restricted } as Awaited<ReturnType<typeof $agent_referee.generateText>>
      })
      expect((await agent_referee(input, late.signal)).success).toBe(false)
    } finally {
      generate.mockRestore()
    }
  })
})

describe('Referee workflow adapter', () => {
  const skeptic_output = {
    status: 'reviewed' as const,
    accepted_claims: [
      {
        claim_ref: 'medic.risk_flags[0]',
        claim: 'The verified label conflicts with the permitted milk restriction.',
        evidence_refs: ['medic.risk_flags[0]'],
        qualification: 'Limit this finding to the exact product variant that was checked.',
      },
    ],
    unsupported_claims: [
      {
        claim_ref: 'investigator.checks[0]',
        claim: 'The brand is safe because no matching record was found.',
        reason: 'No matching record is not proof of safety.',
        evidence_refs: ['investigator.checks[0]'],
      },
    ],
    stale_sources: [],
    uncertainties: [],
    targeted_rechecks: [],
  }

  it('maps the real Skeptic contract without modifying Skeptic output', () => {
    const mapped = build_referee_input({
      prompt: 'Can I use this product?',
      dependencies: {
        Skeptic: { status: 'completed', output: skeptic_output, limitations: [] },
      },
    })

    expect(mapped?.skeptic).toEqual({
      status: 'completed',
      accepted_claim_ids: [],
      qualified_claim_ids: ['medic.risk_flags[0]'],
      rejected_claim_ids: ['investigator.checks[0]'],
      conflicts: [],
      uncertainties: [],
      limitations: [],
    })
    expect(mapped?.findings[0]?.required_constraints.map((constraint) => constraint.action)).toEqual(['qualify', 'exclude'])
    expect(skeptic_output.accepted_claims[0]?.qualification).toContain('exact product variant')
  })

  it('returns the shared workflow envelope for a validated Referee decision', async () => {
    const generate = spyOn($agent_referee, 'generateText')
    try {
      generate.mockImplementation(async (message) => {
        const mapped = schema_input_agent_referee.parse(JSON.parse(String(message)))
        return {
          output: {
            schema_version: 1,
            decision: 'restrict',
            summary: 'One claim requires qualification and another must be excluded.',
            constraints: mapped.findings[0]!.required_constraints,
            disagreements: [],
            excluded_items: [{ id: 'investigator.checks[0]', reason: 'Skeptic rejected this claim.' }],
            limitations: [],
          },
        } as Awaited<ReturnType<typeof $agent_referee.generateText>>
      })

      const result = await adapter_referee(
        {
          prompt: 'Can I use this product?',
          execution_id: crypto.randomUUID(),
          dependencies: {
            Skeptic: { status: 'completed', output: skeptic_output, limitations: [] },
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
      expect(schema_agent_referee.parse(result.output).decision).toBe('restrict')
    } finally {
      generate.mockRestore()
    }
  })
})
