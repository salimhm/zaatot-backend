import { z } from 'zod'

const schema_investigator_decision_status = z.enum(['boycott', 'not_boycotted', 'unknown', 'needs_review'])
const schema_investigator_source = z.enum(['boycat', 'local_knowledge'])

export const schema_input_agent_investigator = z.object({
  brand_name: z.string().trim().min(2).max(255).nullable(),
  product_name: z.string().trim().min(2).max(255).optional(),
})

export const schema_agent_investigator = z.object({
  subject: z.object({
    brand_name: z.string().nullable(),
    product_name: z.string().nullable(),
  }),
  status: z.enum(['evidence_found', 'no_matching_evidence', 'needs_review', 'unavailable', 'needs_input']),
  checked_at: z.iso.datetime(),
  checks: z.array(
    z.object({
      source: schema_investigator_source,
      status: z.enum(['matched', 'not_found', 'unavailable', 'invalid_response']),
      decision_status: schema_investigator_decision_status.nullable(),
      confidence: z.number().min(0).max(100).nullable(),
      reason: z.string().nullable(),
      matched_entity: z
        .object({
          entity_type: z.enum(['product', 'brand', 'company']),
          name: z.string(),
          matched_name: z.string(),
          match_type: z.enum(['exact', 'alias', 'website', 'fuzzy', 'related_entity', 'none']),
          match_score: z.number().min(0).max(100),
        })
        .nullable(),
      matched_path: z.array(z.string()),
      citations: z.array(
        z.object({
          source_name: z.string(),
          source_url: z.string(),
          title: z.string().nullable(),
          url: z.string(),
          quote: z.string().nullable(),
        }),
      ),
    }),
  ),
  limitations: z.array(z.string()),
  message: z.string(),
  analysis_draft: z.string().nullable().describe('Optional model-written summary; not authoritative evidence or a final verdict'),
})

export type type_input_agent_investigator = z.infer<typeof schema_input_agent_investigator>
export type type_schema_agent_investigator = z.infer<typeof schema_agent_investigator>
