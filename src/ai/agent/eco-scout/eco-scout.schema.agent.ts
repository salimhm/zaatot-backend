import { z } from 'zod'

import { schema_source_detective } from '@agent/detective/detective.schema.agent'
import { schema_tool_product_lookup_packaging, schema_tool_product_lookup_score } from '@tool/product-lookup/product-lookup.dto.tool'

export const eco_scout_source_provider_label = {
  local_database: 'Zaatot product catalog',
  open_food_facts: 'Open Food Facts',
} as const

const schema_eco_scout_indicator = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('eco_score'),
    label: z.literal('Eco-Score'),
    value: schema_tool_product_lookup_score,
    scope: z.literal('product'),
    evidence_ref: z.literal('detective.related_products.exact_variant.ecoscore'),
  }),
  z.object({
    kind: z.literal('packaging_material'),
    label: z.literal('Packaging material'),
    value: z.string().trim().min(1).max(120),
    scope: z.literal('product'),
    evidence_ref: z.literal('detective.related_products.exact_variant.packaging.materials'),
  }),
  z.object({
    kind: z.literal('packaging_recycling_instruction'),
    label: z.literal('Packaging recycling instruction'),
    value: z.string().trim().min(1).max(120),
    scope: z.literal('product'),
    evidence_ref: z.literal('detective.related_products.exact_variant.packaging.recycling_instructions'),
  }),
])

export const schema_input_agent_eco_scout = z.object({
  product: z.object({
    source: schema_source_detective,
    barcode: z.string().regex(/^\d{6,64}$/),
    name: z.string().trim().min(1).nullable(),
    brand_name: z.string().trim().min(1).nullable(),
    ecoscore: schema_tool_product_lookup_score.nullable(),
    packaging: schema_tool_product_lookup_packaging.nullable().optional(),
    retrieved_at: z.iso.datetime().nullable(),
  }),
})

export const schema_agent_eco_scout = z.object({
  status: z.enum(['available', 'partial']),
  subject: z
    .object({
      product_name: z.string().nullable(),
      barcode: z.string().regex(/^\d{6,64}$/),
      brand_name: z.string().nullable(),
    })
    .nullable(),
  evidence_scope: z.enum(['product', 'none']),
  indicators: z.array(schema_eco_scout_indicator).max(41),
  sources: z.array(
    z.object({
      provider: schema_source_detective,
      url: z.string().url().nullable(),
      retrieved_at: z.iso.datetime(),
    }),
  ),
  missing_information: z.array(z.string()),
  limitations: z.array(z.string()),
  summary: z.string(),
})

export type type_input_agent_eco_scout = z.infer<typeof schema_input_agent_eco_scout>
export type type_schema_agent_eco_scout = z.infer<typeof schema_agent_eco_scout>
