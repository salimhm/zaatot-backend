import { z } from 'zod'

export const schema_tool_alternative_lookup_candidate = z
  .object({
    name: z.string().trim().min(1).max(255),
    image_url: z.string().trim().min(1).max(2048).nullable(),
    description: z.string().trim().min(1).max(1000).nullable(),
  })
  .strict()

export const schema_tool_alternative_lookup_boycat_result = z
  .object({
    provider: z.literal('boycat'),
    provider_status: z.enum(['matched', 'not_found', 'ambiguous', 'unavailable', 'invalid_response']),
    requested_brand: z.string().trim().min(1).max(255),
    matched_brand: z.string().trim().min(1).max(255).nullable(),
    reason: z.string().trim().min(1).max(2000),
    alternatives: z.array(schema_tool_alternative_lookup_candidate).max(50),
    retrieved_at: z.iso.datetime(),
  })
  .strict()

export const dto_tool_alternative_lookup = {
  boycat_by_brand: z
    .object({
      brand_name: z.string().trim().min(2).max(255).describe('Exact resolved brand name for which Boycat alternatives are requested'),
    })
    .strict(),
}

export type type_tool_alternative_lookup_boycat_result = z.infer<typeof schema_tool_alternative_lookup_boycat_result>
