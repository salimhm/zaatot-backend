import { z } from 'zod'

import { schema_tool_product_lookup_packaging, schema_tool_product_lookup_score } from '@tool/product-lookup/product-lookup.dto.tool'

export const schema_bargain_hunter_dimension = z.enum(['boycott', 'price', 'environment', 'health'])

export const schema_bargain_hunter_subject = z
  .object({
    type: z.enum(['product', 'brand']),
    name: z.string().trim().min(1).max(500),
    brand: z.string().trim().min(1).max(500).nullable(),
    barcode: z.string().trim().min(1).max(64).nullable(),
  })
  .strict()

export const schema_input_agent_bargain_hunter = z
  .object({
    request: z.string().trim().min(1).max(4000),
    subject: schema_bargain_hunter_subject,
    requested_dimensions: z.array(schema_bargain_hunter_dimension).min(1).max(4).default(['boycott']),
    constraints: z
      .array(
        z
          .object({
            code: z.string().trim().min(1).max(100),
            action: z.enum(['preserve', 'qualify', 'exclude', 'block']),
            message: z.string().trim().min(1).max(1000),
          })
          .strict(),
      )
      .max(50)
      .default([]),
    max_candidates: z.number().int().min(1).max(3).default(3),
  })
  .strict()

export const schema_bargain_hunter_product = z
  .object({
    source: z.literal('open_food_facts'),
    source_id: z.string().trim().min(1).max(300),
    barcode: z.string().trim().min(1).max(64).nullable(),
    name: z.string().trim().min(1).max(500).nullable(),
    brand_name: z.string().trim().min(1).max(500).nullable(),
    image_url: z.string().trim().min(1).max(2048).nullable(),
    nova_group: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable(),
    ecoscore: schema_tool_product_lookup_score.nullable(),
    nutriscore: schema_tool_product_lookup_score.nullable(),
    packaging: schema_tool_product_lookup_packaging.nullable(),
    retrieved_at: z.iso.datetime(),
  })
  .strict()
  .refine((product) => Boolean(product.barcode || product.name), { message: 'A resolved product needs a barcode or product name.' })

export const schema_bargain_hunter_candidate = z
  .object({
    candidate_id: z.string().trim().min(1).max(200),
    entity_type: z.literal('brand'),
    name: z.string().trim().min(1).max(255),
    image_url: z.string().trim().min(1).max(2048).nullable(),
    description: z.string().trim().min(1).max(1000).nullable(),
    source: z.literal('boycat'),
    source_id: z.string().trim().min(1).max(200),
    products: z.array(schema_bargain_hunter_product).max(3),
    resolution_status: z.enum(['resolved', 'brand_only', 'unavailable']),
    validation_status: z.literal('pending_review'),
    reasons: z.array(z.string().trim().min(1).max(1000)).min(1).max(5),
  })
  .strict()
  .superRefine((candidate, context) => {
    if (candidate.resolution_status === 'resolved' && candidate.products.length === 0) {
      context.addIssue({ code: 'custom', path: ['products'], message: 'A resolved candidate needs at least one product.' })
    }
    if (candidate.resolution_status !== 'resolved' && candidate.products.length > 0) {
      context.addIssue({ code: 'custom', path: ['products'], message: 'Only resolved candidates may contain products.' })
    }
  })

export const schema_agent_bargain_hunter = z
  .object({
    schema_version: z.literal(1),
    status: z.enum(['candidates_found', 'none_found', 'insufficient_data', 'unavailable']),
    subject: schema_bargain_hunter_subject,
    requested_dimensions: z.array(schema_bargain_hunter_dimension).min(1).max(4),
    candidates: z.array(schema_bargain_hunter_candidate).max(3),
    limitations: z.array(z.string().trim().min(1).max(1000)).max(30),
    message: z.string().trim().min(1).max(2000),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.status === 'candidates_found' && result.candidates.length === 0) {
      context.addIssue({ code: 'custom', path: ['candidates'], message: 'candidates_found requires at least one candidate.' })
    }
    if (result.status !== 'candidates_found' && result.candidates.length > 0) {
      context.addIssue({ code: 'custom', path: ['candidates'], message: 'Only candidates_found may contain candidates.' })
    }
  })

export type type_schema_input_agent_bargain_hunter = z.input<typeof schema_input_agent_bargain_hunter>
export type type_parsed_input_agent_bargain_hunter = z.output<typeof schema_input_agent_bargain_hunter>
export type type_schema_agent_bargain_hunter = z.infer<typeof schema_agent_bargain_hunter>
