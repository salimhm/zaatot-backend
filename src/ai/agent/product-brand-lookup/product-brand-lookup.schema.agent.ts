import { z } from 'zod'

const schema_source_product_brand_lookup = z.enum(['local_database', 'open_food_facts'])
const schema_score_product_brand_lookup = z.enum(['a', 'b', 'c', 'd', 'e'])

export const schema_agent_product_brand_lookup = z.object({
  query_type: z.enum(['product', 'brand', 'mixed', 'unknown']),
  found: z.boolean(),
  sources_checked: z.array(schema_source_product_brand_lookup),
  products: z.array(
    z.object({
      source: schema_source_product_brand_lookup,
      product_id: z.number().nullable(),
      barcode: z.string().nullable(),
      type: z.string().nullable(),
      name: z.string().nullable(),
      brand_name: z.string().nullable(),
      images: z.array(z.string()),
      nova_group: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable(),
      ecoscore: schema_score_product_brand_lookup.nullable(),
      nutriscore: schema_score_product_brand_lookup.nullable(),
      ingredients: z.array(z.string()).nullable(),
      allergens: z.array(z.string()).nullable(),
    }),
  ),
  brands: z.array(
    z.object({
      source: z.literal('local_database'),
      brand_id: z.number().nullable(),
      name: z.string(),
    }),
  ),
  message: z.string().describe('Short status summary; factual details are in products and brands'),
})

export type type_schema_agent_product_brand_lookup = z.infer<typeof schema_agent_product_brand_lookup>

export const schema_product_lookup_record = z.object({
  product_id: z.number().nullish(),
  product_barcode: z.string().nullish(),
  product_type: z.string().nullish(),
  product_name: z.string().nullish(),
  brand_name: z.string().nullish(),
  product_brand_name: z.string().nullish(),
  product_images: z.array(z.string()).nullish(),
  product_nova_group: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullish(),
  product_ecoscore: schema_score_product_brand_lookup.nullish(),
  product_nutriscore: schema_score_product_brand_lookup.nullish(),
  product_metadata: z
    .object({
      ingredients: z.array(z.string()).nullish(),
      allergens: z.array(z.string()).nullish(),
    })
    .nullish(),
})

export type type_product_lookup_record = z.infer<typeof schema_product_lookup_record>

export const schema_product_lookup_tool_result = z.discriminatedUnion('toolName', [
  z.object({
    toolName: z.literal('tool_product_lookup_local_by_barcode'),
    output: z.object({
      found: z.boolean(),
      source: z.literal('local_database'),
      data: z.array(schema_product_lookup_record),
    }),
  }),
  z.object({
    toolName: z.literal('tool_product_lookup_local_by_name'),
    output: z.object({
      found: z.boolean(),
      source: z.literal('local_database'),
      data: z.array(schema_product_lookup_record),
    }),
  }),
  z.object({
    toolName: z.literal('tool_product_lookup_provider_by_barcode'),
    output: z.object({
      found: z.boolean(),
      source: z.literal('open_food_facts'),
      data: schema_product_lookup_record.nullable(),
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
])
