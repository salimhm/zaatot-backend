import { z } from 'zod'

export const schema_agent_skeptic = z.object({
  status: z.enum(['reviewed', 'needs_review', 'unavailable']),

  accepted_claims: z.array(
    z.object({
      claim_ref: z.string().min(1),
      claim: z.string().min(1),
      evidence_refs: z.array(z.string().min(1)).min(1),
      qualification: z.string().nullable(),
    }),
  ),

  unsupported_claims: z.array(
    z.object({
      claim_ref: z.string().min(1),
      claim: z.string().min(1),
      reason: z.string().min(1),
      evidence_refs: z.array(z.string().min(1)),
    }),
  ),

  stale_sources: z.array(
    z.object({
      evidence_ref: z.string().min(1),
      reason: z.string().min(1),
    }),
  ),

  uncertainties: z.array(
    z.object({
      claim_ref: z.string().nullable(),
      issue: z.string().min(1),
      missing_information: z.array(z.string().min(1)),
    }),
  ),

  targeted_rechecks: z.array(
    z.object({
      claim_ref: z.string().min(1),
      query: z.string().min(1),
      purpose: z.string().min(1),
    }),
  ),
})

export type type_schema_agent_skeptic = z.infer<typeof schema_agent_skeptic>
