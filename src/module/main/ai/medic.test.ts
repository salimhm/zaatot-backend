import type { type_schema_agent_medic } from '@agent/medic/medic.schema.agent'

import { describe, expect, it, spyOn } from 'bun:test'

import { $agent_medic, agent_medic } from '@agent/medic/medic.agent'
import { schema_agent_medic } from '@agent/medic/medic.schema.agent'

const incomplete_assessment: type_schema_agent_medic = {
  status: 'insufficient_data',
  mode: 'generic',
  summary: 'The product label and permitted profile are needed to assess personal compatibility.',
  checked_scope: [],
  risk_flags: [],
  required_restrictions: [],
  missing_information: ['Verified ingredient and allergen declarations', 'Permitted personal restrictions'],
  limitations: ['Personal compatibility has not been assessed.'],
}

describe('Medic assessment boundaries', () => {
  it('rejects reassuring output when required checks are missing or none were completed', () => {
    expect(schema_agent_medic.safeParse({ ...incomplete_assessment, status: 'no_flags_detected' }).success).toBe(false)
    expect(schema_agent_medic.safeParse({ ...incomplete_assessment, status: 'no_flags_detected', missing_information: [] }).success).toBe(false)
  })

  it('preserves a supported conflict even when other evidence remains unavailable', () => {
    const assessment: type_schema_agent_medic = {
      ...incomplete_assessment,
      status: 'flags_found',
      mode: 'personalized',
      summary: 'The supplied label conflicts with the declared restriction; other checks remain incomplete.',
      checked_scope: ['Declared allergen compared with the supplied label'],
      risk_flags: [
        {
          kind: 'allergen_conflict',
          summary: 'The label declares the same allergen as the permitted profile.',
          product_fact: 'The supplied example label declares milk.',
          restriction: 'User-declared milk allergy',
          evidence_refs: ['label-1', 'profile.allergens[0]'],
          rule_id: null,
        },
      ],
      required_restrictions: ['Preserve the declared allergen restriction.'],
      missing_information: ['Nutrition information for the additional requested check'],
    }
    expect(schema_agent_medic.parse(assessment)).toEqual(assessment)
    expect(schema_agent_medic.safeParse({ ...assessment, status: 'insufficient_data' }).success).toBe(false)
    expect(schema_agent_medic.safeParse({ ...assessment, mode: 'generic' }).success).toBe(false)
    expect(
      schema_agent_medic.safeParse({ ...assessment, risk_flags: assessment.risk_flags.map((flag) => ({ ...flag, evidence_refs: [] })) }).success,
    ).toBe(false)
  })

  it('validates model output before returning a successful agent result', async () => {
    const generate = spyOn($agent_medic, 'generateText')
    try {
      generate.mockResolvedValue({ output: incomplete_assessment } as Awaited<ReturnType<typeof $agent_medic.generateText>>)
      expect(await agent_medic('Can this product fit my restrictions?')).toEqual({ success: true, data: incomplete_assessment })

      generate.mockResolvedValue({
        output: { ...incomplete_assessment, status: 'no_flags_detected' },
      } as Awaited<ReturnType<typeof $agent_medic.generateText>>)
      expect((await agent_medic('Can this product fit my restrictions?')).success).toBe(false)
    } finally {
      generate.mockRestore()
    }
  })

  it('does not start a cancelled assessment or return a result after cancellation', async () => {
    const generate = spyOn($agent_medic, 'generateText')
    try {
      const cancelled = new AbortController()
      cancelled.abort()
      expect((await agent_medic('Assess this product', cancelled.signal)).success).toBe(false)
      expect(generate).not.toHaveBeenCalled()

      const late = new AbortController()
      generate.mockImplementation(async () => {
        late.abort()
        return { output: incomplete_assessment } as Awaited<ReturnType<typeof $agent_medic.generateText>>
      })
      expect((await agent_medic('Assess this product', late.signal)).success).toBe(false)
    } finally {
      generate.mockRestore()
    }
  })
})
