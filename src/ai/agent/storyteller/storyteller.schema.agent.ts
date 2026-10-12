import { z } from 'zod'

const schema_storyteller_subject = z
  .object({
    type: z.enum(['product', 'brand']),
    name: z.string().trim().min(1).max(500),
    brand: z.string().trim().min(1).max(500).nullable(),
    barcode: z.string().trim().min(1).max(64).nullable(),
  })
  .strict()

const schema_storyteller_claim = z
  .object({
    id: z.string().trim().min(1).max(200),
    text: z.string().trim().min(1).max(2000),
    qualification: z.string().trim().min(1).max(1000).nullable(),
    citation_ids: z.array(z.string().trim().min(1).max(200)).max(20),
  })
  .strict()

const schema_storyteller_constraint = z
  .object({
    code: z.string().trim().min(1).max(100),
    action: z.enum(['preserve', 'qualify', 'exclude', 'block']),
    message: z.string().trim().min(1).max(1000),
  })
  .strict()

const schema_storyteller_source = z
  .object({
    id: z.string().trim().min(1).max(200),
    provider: z.string().trim().min(1).max(300),
  })
  .strict()

export const schema_input_agent_storyteller = z
  .object({
    request: z.string().trim().min(1).max(4000),
    subject: schema_storyteller_subject.nullable(),
    decision: z.enum(['pass', 'restrict', 'block', 'needs_review']),
    decision_summary: z.string().trim().min(1).max(2000),
    accepted_claims: z.array(schema_storyteller_claim).max(100),
    excluded_claims: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(200),
            reason: z.string().trim().min(1).max(1000),
          })
          .strict(),
      )
      .max(100),
    constraints: z.array(schema_storyteller_constraint).max(50),
    limitations: z.array(z.string().trim().min(1).max(1000)).max(100),
    sources: z.array(schema_storyteller_source).max(100),
    repair_feedback: z.array(z.string().trim().min(1).max(1000)).max(30),
  })
  .strict()
  .superRefine((data, context) => {
    const claim_ids = data.accepted_claims.map((claim) => claim.id)
    const excluded_ids = data.excluded_claims.map((claim) => claim.id)
    const source_ids = data.sources.map((source) => source.id)
    if (new Set(claim_ids).size !== claim_ids.length) {
      context.addIssue({ code: 'custom', path: ['accepted_claims'], message: 'Accepted claim IDs must be unique.' })
    }
    if (new Set(source_ids).size !== source_ids.length) {
      context.addIssue({ code: 'custom', path: ['sources'], message: 'Source IDs must be unique.' })
    }
    for (const excluded_id of excluded_ids) {
      if (claim_ids.includes(excluded_id)) {
        context.addIssue({ code: 'custom', path: ['excluded_claims'], message: `Claim ${excluded_id} cannot be both accepted and excluded.` })
      }
    }
    const known_sources = new Set(source_ids)
    for (const [claim_index, claim] of data.accepted_claims.entries()) {
      for (const citation_id of claim.citation_ids) {
        if (!known_sources.has(citation_id)) {
          context.addIssue({
            code: 'custom',
            path: ['accepted_claims', claim_index, 'citation_ids'],
            message: `Unknown citation ID: ${citation_id}`,
          })
        }
      }
    }
  })

// The model selects already-reviewed claims. The backend resolves their exact text,
// constraints, limitations and citations into the public explanation.
export const schema_agent_storyteller_draft = z
  .object({
    schema_version: z.literal(1),
    summary: z.string().trim().min(1).max(2000),
    selected_claim_ids: z.array(z.string().trim().min(1).max(200)).max(8),
  })
  .strict()

export const schema_agent_storyteller = z
  .object({
    schema_version: z.literal(1),
    summary: z.string().trim().min(1).max(2000),
    reasons: z.array(z.string().trim().min(1).max(3000)).max(8),
    tradeoffs: z.array(z.string().trim().min(1).max(1000)).max(150),
    citation_ids: z.array(z.string().trim().min(1).max(200)).max(160),
  })
  .strict()

export type type_schema_input_agent_storyteller = z.infer<typeof schema_input_agent_storyteller>
export type type_schema_agent_storyteller_draft = z.infer<typeof schema_agent_storyteller_draft>
export type type_schema_agent_storyteller = z.infer<typeof schema_agent_storyteller>
