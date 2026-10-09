import type { type_schema_input_agent_referee } from '@agent/referee/referee.schema.agent'
import type { consumer_specialist_input, consumer_step_result } from '@ai/execution/execution-contract.ai'

import { unique_strings } from '@ai/adapter/utils.adapter.ai'
import { agent_referee } from '@agent/referee/referee.agent'
import { schema_agent_referee, schema_input_agent_referee } from '@agent/referee/referee.schema.agent'
import { schema_agent_skeptic } from '@agent/skeptic/skeptic.schema.agent'

const skeptic_status = {
  reviewed: 'completed',
  needs_review: 'needs_review',
  unavailable: 'unavailable',
} as const

// Adapts Skeptic's concrete schema into Referee's intentionally generic v1 contract.
// This keeps either agent free to evolve without coupling their public schemas.
export const build_referee_input = (input: Pick<consumer_specialist_input, 'prompt' | 'dependencies'>): type_schema_input_agent_referee | null => {
  const skeptic = schema_agent_skeptic.safeParse(input.dependencies.Skeptic?.output)
  if (!skeptic.success) return null

  const accepted = skeptic.data.accepted_claims
  const rejected = skeptic.data.unsupported_claims
  const claims = [
    ...accepted.map((claim) => ({ id: claim.claim_ref, text: claim.claim, evidence_refs: claim.evidence_refs })),
    ...rejected.map((claim) => ({ id: claim.claim_ref, text: claim.claim, evidence_refs: claim.evidence_refs })),
  ]
  const required_constraints: type_schema_input_agent_referee['findings'][number]['required_constraints'] = [
    ...accepted.flatMap((claim, index) =>
      claim.qualification
        ? [
            {
              code: `skeptic-qualification-${index + 1}`,
              severity: 'warning' as const,
              action: 'qualify' as const,
              message: claim.qualification,
              applies_to: [claim.claim_ref],
              source_refs: [claim.claim_ref, ...claim.evidence_refs],
            },
          ]
        : [],
    ),
    ...rejected.map((claim, index) => ({
      code: `skeptic-exclusion-${index + 1}`,
      severity: 'warning' as const,
      action: 'exclude' as const,
      message: claim.reason,
      applies_to: [claim.claim_ref],
      source_refs: [claim.claim_ref, ...claim.evidence_refs],
    })),
  ]
  const limitations = unique_strings([
    ...(input.dependencies.Skeptic?.limitations ?? []),
    ...skeptic.data.stale_sources.map((source) => source.reason),
    ...skeptic.data.uncertainties.flatMap((uncertainty) => [uncertainty.issue, ...uncertainty.missing_information]),
  ])

  return schema_input_agent_referee.parse({
    request: input.prompt,
    subject: null,
    findings: [
      {
        id: 'skeptic-evidence-review',
        agent: 'Skeptic',
        topic: 'evidence_review',
        status: skeptic_status[skeptic.data.status],
        claims,
        required_constraints,
        limitations,
      },
    ],
    skeptic: {
      status: skeptic_status[skeptic.data.status],
      accepted_claim_ids: accepted.filter((claim) => claim.qualification === null).map((claim) => claim.claim_ref),
      qualified_claim_ids: accepted.filter((claim) => claim.qualification !== null).map((claim) => claim.claim_ref),
      rejected_claim_ids: rejected.map((claim) => claim.claim_ref),
      conflicts: [],
      uncertainties: skeptic.data.uncertainties.flatMap((uncertainty) => [uncertainty.issue, ...uncertainty.missing_information]),
      limitations,
    },
    policy_constraints: [],
    candidate_ids: [],
  })
}

// Workflow adapter: calls Referee and maps its validated decision to the shared step envelope.
export const adapter_referee = async (input: consumer_specialist_input, signal: AbortSignal): Promise<consumer_step_result> => {
  signal.throwIfAborted()
  const referee_input = build_referee_input(input)
  if (!referee_input) {
    return {
      status: 'needs_review',
      output: null,
      limitations: ['Referee requires a validated Skeptic review.'],
    }
  }

  const result = await agent_referee(referee_input, signal)
  if (!result.success) throw new Error('Referee constraint review failed', { cause: result.data })

  const output = schema_agent_referee.parse(result.data)
  return {
    status: output.decision === 'block' ? 'blocked' : output.decision === 'needs_review' ? 'needs_review' : 'completed',
    output,
    limitations: output.limitations,
  }
}
