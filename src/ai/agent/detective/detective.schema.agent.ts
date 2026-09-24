import { z } from 'zod'

import {
  schema_tool_product_lookup_provider_availability,
  schema_tool_product_lookup_provider_brand_result,
  schema_tool_product_lookup_provider_product_result,
  schema_tool_product_lookup_record,
  schema_tool_product_lookup_score,
} from '@tool/product-lookup/product-lookup.dto.tool'

export const schema_source_detective = z.enum(['local_database', 'open_food_facts'])

export const schema_product_detective = z.object({
  source: schema_source_detective,
  product_id: z.number().nullable(),
  barcode: z.string().nullable(),
  type: z.string().nullable(),
  name: z.string().nullable(),
  brand_name: z.string().nullable(),
  brand_candidates: z.array(z.string()).max(5),
  images: z.array(z.string()),
  nova_group: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable(),
  ecoscore: schema_tool_product_lookup_score.nullable(),
  nutriscore: schema_tool_product_lookup_score.nullable(),
  ingredients: z.array(z.string()).nullable(),
  allergens: z.array(z.string()).nullable(),
})

export const schema_brand_detective = z.object({
  source: schema_source_detective,
  brand_id: z.number().nullable(),
  name: z.string(),
})

const schema_subject_detective = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('brand'),
    source: schema_source_detective,
    name: z.string(),
    brand_id: z.number().nullable(),
  }),
  z.object({
    type: z.literal('product'),
    source: schema_source_detective,
    name: z.string().nullable(),
    barcode: z.string().nullable(),
    brand_name: z.string().nullable(),
    brand_candidates: z.array(z.string()).max(5),
  }),
])

const schema_candidate_detective = schema_subject_detective

export const schema_selection_detective = z.object({
  required: z.boolean(),
  options: z.array(schema_candidate_detective),
  total_options: z.number().int().nonnegative(),
})

export const schema_related_products_detective = z.object({
  relation: z.enum(['brand_preview', 'product_matches', 'none']),
  items: z.array(schema_product_detective),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().nonnegative(),
  has_more: z.boolean(),
})

export const schema_agent_detective = z.object({
  status: z.enum(['identified', 'requires_selection', 'not_found', 'unavailable']),
  query_type: z.enum(['product', 'brand', 'mixed', 'unknown']),
  found: z.boolean(),
  subject: schema_subject_detective.nullable(),
  selection: schema_selection_detective,
  related_products: schema_related_products_detective,
  sources_checked: z.array(schema_source_detective),
  message: z.string().describe('Short status summary; factual details are in subject, selection, and related_products'),
})

export type type_schema_agent_detective = z.infer<typeof schema_agent_detective>
export type type_product_lookup_record = z.infer<typeof schema_tool_product_lookup_record>

export const schema_product_lookup_tool_result = z.discriminatedUnion('toolName', [
  z.object({
    toolName: z.literal('tool_product_lookup_local_by_barcode'),
    output: z.object({
      found: z.boolean(),
      source: z.literal('local_database'),
      data: z.array(schema_tool_product_lookup_record),
    }),
  }),
  z.object({
    toolName: z.literal('tool_product_lookup_local_by_name'),
    output: z.object({
      found: z.boolean(),
      source: z.literal('local_database'),
      data: z.array(schema_tool_product_lookup_record),
      total: z.number().int().nonnegative().optional(),
      page: z.number().int().positive().optional(),
      page_size: z.number().int().positive().optional(),
    }),
  }),
  z.object({
    toolName: z.literal('tool_product_lookup_provider_by_barcode'),
    output: schema_tool_product_lookup_provider_availability.extend({
      found: z.boolean(),
      source: z.literal('open_food_facts'),
      data: schema_tool_product_lookup_record.nullable(),
    }),
  }),
  z.object({
    toolName: z.literal('tool_product_lookup_brand_by_name'),
    output: z.object({
      found: z.boolean(),
      source: z.literal('local_database'),
      data: z.array(
        z.object({
          brand_id: z.number().nullish(),
          brand_name: z.string(),
        }),
      ),
    }),
  }),
  z.object({
    toolName: z.literal('tool_product_lookup_provider_by_product_name'),
    output: schema_tool_product_lookup_provider_availability.extend({
      found: z.boolean(),
      source: z.literal('open_food_facts'),
      data: schema_tool_product_lookup_provider_product_result.nullable(),
    }),
  }),
  z.object({
    toolName: z.literal('tool_product_lookup_provider_by_brand_name'),
    output: schema_tool_product_lookup_provider_availability.extend({
      found: z.boolean(),
      source: z.literal('open_food_facts'),
      data: schema_tool_product_lookup_provider_brand_result.nullable(),
    }),
  }),
])

export const schema_product_lookup_record = schema_tool_product_lookup_record
