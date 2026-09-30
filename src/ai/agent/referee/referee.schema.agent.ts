import { z } from 'zod'

export const schema_referee_constraint = z
  .object({
    code: z.string().trim().min(1).max(100),
    severity: z.enum(['info', 'warning', 'critical']),
    action: z.enum(['preserve', 'qualify', 'exclude', 'block']),
    message: z.string().trim().min(1).max(1000),
    applies_to: z.array(z.string().trim().min(1).max(200)).max(20),
    source_refs: z.array(z.string().trim().min(1).max(200)).max(20),
  })
  .strict()

const schema_referee_claim = z
  .object({
    id: z.string().trim().min(1).max(100),
    text: z.string().trim().min(1).max(2000),
    evidence_refs: z.array(z.string().trim().min(1).max(200)).max(20),
  })
  .strict()

const schema_referee_finding = z
  .object({
    id: z.string().trim().min(1).max(100),
    agent: z.string().trim().min(1).max(100),
    topic: z.string().trim().min(1).max(100),
    status: z.enum(['completed', 'partial', 'blocked', 'needs_input', 'needs_review', 'error', 'unavailable']),
    claims: z.array(schema_referee_claim).max(50),
    required_constraints: z.array(schema_referee_constraint).max(20),
    limitations: z.array(z.string().trim().min(1).max(1000)).max(30),
  })
  .strict()

const schema_referee_skeptic_review = z
  .object({
    status: z.enum(['completed', 'partial', 'needs_review', 'unavailable']),
    accepted_claim_ids: z.array(z.string().trim().min(1).max(100)).max(100),
    qualified_claim_ids: z.array(z.string().trim().min(1).max(100)).max(100),
    rejected_claim_ids: z.array(z.string().trim().min(1).max(100)).max(100),
    conflicts: z
      .array(
        z
          .object({
            topic: z.string().trim().min(1).max(100),
            claim_ids: z.array(z.string().trim().min(1).max(100)).min(2).max(20),
            summary: z.string().trim().min(1).max(1000),
          })
          .strict(),
      )
      .max(20),
    uncertainties: z.array(z.string().trim().min(1).max(1000)).max(30),
    limitations: z.array(z.string().trim().min(1).max(1000)).max(30),
  })
  .strict()

export const schema_input_agent_referee = z
  .object({
    request: z.string().trim().min(1).max(4000),
    subject: z
      .object({
        type: z.enum(['product', 'brand', 'unknown']),
        name: z.string().trim().min(1).max(500).nullable(),
        brand: z.string().trim().min(1).max(500).nullable(),
        barcode: z.string().trim().min(1).max(64).nullable(),
      })
      .strict()
      .nullable(),
    findings: z.array(schema_referee_finding).max(30),
    skeptic: schema_referee_skeptic_review.nullable(),
    policy_constraints: z.array(schema_referee_constraint).max(30),
    candidate_ids: z.array(z.string().trim().min(1).max(100)).max(30),
  })
  .strict()
  .superRefine((data, context) => {
    const finding_ids = new Set<string>()
    const claim_ids = new Set<string>()

    for (const [finding_index, finding] of data.findings.entries()) {
      if (finding_ids.has(finding.id)) {
        context.addIssue({ code: 'custom', path: ['findings', finding_index, 'id'], message: 'Finding IDs must be unique.' })
      }
      finding_ids.add(finding.id)

      for (const [claim_index, claim] of finding.claims.entries()) {
        if (claim_ids.has(claim.id)) {
          context.addIssue({
            code: 'custom',
            path: ['findings', finding_index, 'claims', claim_index, 'id'],
            message: 'Claim IDs must be unique.',
          })
        }
        claim_ids.add(claim.id)
      }
    }

    if (!data.skeptic) return

    const classifications = [
      ...data.skeptic.accepted_claim_ids.map((id) => ({ id, field: 'accepted_claim_ids' as const })),
      ...data.skeptic.qualified_claim_ids.map((id) => ({ id, field: 'qualified_claim_ids' as const })),
      ...data.skeptic.rejected_claim_ids.map((id) => ({ id, field: 'rejected_claim_ids' as const })),
    ]
    const classified = new Set<string>()
    for (const classification of classifications) {
      if (!claim_ids.has(classification.id)) {
        context.addIssue({
          code: 'custom',
          path: ['skeptic', classification.field],
          message: `Unknown claim ID: ${classification.id}`,
        })
      }
      if (classified.has(classification.id)) {
        context.addIssue({
          code: 'custom',
          path: ['skeptic', classification.field],
          message: `Claim ${classification.id} cannot have multiple Skeptic classifications.`,
        })
      }
      classified.add(classification.id)
    }

    for (const [conflict_index, conflict] of data.skeptic.conflicts.entries()) {
      for (const claim_id of conflict.claim_ids) {
        if (!claim_ids.has(claim_id)) {
          context.addIssue({
            code: 'custom',
            path: ['skeptic', 'conflicts', conflict_index, 'claim_ids'],
            message: `Unknown claim ID: ${claim_id}`,
          })
        }
      }
    }
  })

export const schema_agent_referee = z
  .object({
    schema_version: z.literal(1),
    decision: z.enum(['pass', 'restrict', 'block', 'needs_review']),
    summary: z.string().trim().min(1).max(2000),
    constraints: z.array(schema_referee_constraint).max(50),
    disagreements: z
      .array(
        z
          .object({
            topic: z.string().trim().min(1).max(100),
            positions: z
              .array(
                z
                  .object({
                    claim_id: z.string().trim().min(1).max(100),
                    statement: z.string().trim().min(1).max(1000),
                  })
                  .strict(),
              )
              .min(2)
              .max(20),
            resolution: z.enum(['resolved', 'preserve_uncertainty', 'requires_review']),
            explanation: z.string().trim().min(1).max(1000),
          })
          .strict(),
      )
      .max(20),
    excluded_items: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(100),
            reason: z.string().trim().min(1).max(1000),
          })
          .strict(),
      )
      .max(50),
    limitations: z.array(z.string().trim().min(1).max(1000)).max(50),
  })
  .strict()
  .superRefine((data, context) => {
    const actions = new Set(data.constraints.map((constraint) => constraint.action))
    if (data.decision === 'pass' && (actions.has('qualify') || actions.has('exclude') || actions.has('block'))) {
      context.addIssue({ code: 'custom', path: ['decision'], message: 'A pass decision cannot carry restrictive actions.' })
    }
    if (data.decision === 'restrict' && !actions.has('qualify') && !actions.has('exclude')) {
      context.addIssue({ code: 'custom', path: ['constraints'], message: 'A restrict decision requires a qualify or exclude action.' })
    }
    if (data.decision === 'block' && !actions.has('block')) {
      context.addIssue({ code: 'custom', path: ['constraints'], message: 'A block decision requires a block action.' })
    }
    if (
      data.decision === 'needs_review' &&
      !data.disagreements.some((disagreement) => disagreement.resolution === 'requires_review') &&
      data.limitations.length === 0
    ) {
      context.addIssue({
        code: 'custom',
        path: ['decision'],
        message: 'A needs_review decision requires an unresolved disagreement or limitation.',
      })
    }
  })

export type type_schema_input_agent_referee = z.infer<typeof schema_input_agent_referee>
export type type_schema_agent_referee = z.infer<typeof schema_agent_referee>
