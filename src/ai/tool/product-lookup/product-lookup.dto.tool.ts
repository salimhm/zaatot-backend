import { z } from 'zod'

export const schema_tool_product_lookup_score = z.enum(['a', 'b', 'c', 'd', 'e'])

export const schema_tool_product_lookup_nutrient = z.object({
  code: z.string().min(1),
  value: z.number().finite().nonnegative(),
  unit: z.string().min(1),
  basis: z.enum(['per_100g', 'per_100ml', 'per_serving']),
})

export const schema_tool_product_lookup_nutrition = z.object({
  variant: z.object({
    product_id: z.number().nullish(),
    product_barcode: z.string().regex(/^\d{6,64}$/),
    product_name: z.string().nullish(),
  }),
  serving: z
    .object({
      value: z.number().finite().positive(),
      unit: z.string().min(1),
    })
    .nullable(),
  nutrients: z.array(schema_tool_product_lookup_nutrient),
  sources: z.array(
    z.object({
      provider: z.string().min(1),
      url: z.string().url().nullable(),
      retrieved_at: z.string().min(1),
      fresh_until: z.string().min(1).nullable(),
    }),
  ),
  completeness: z.object({
    status: z.enum(['complete', 'partial', 'unavailable']),
    complete: z.boolean(),
    missing_nutrient_codes: z.array(z.string().min(1)),
  }),
})

export const schema_tool_product_lookup_nutrition_result = z.object({
  found: z.boolean(),
  available: z.boolean(),
  issue: z.enum(['configuration', 'temporarily_unavailable']).nullable(),
  source: z.enum(['local_database', 'open_food_facts']),
  data: schema_tool_product_lookup_nutrition.nullable(),
})

export const schema_tool_product_lookup_record = z.object({
  product_id: z.number().nullish(),
  product_barcode: z.string().nullish(),
  product_type: z.string().nullish(),
  product_name: z.string().nullish(),
  brand_name: z.string().nullish(),
  product_brand_name: z.string().nullish(),
  product_brand_names: z.array(z.string()).max(5).nullish(),
  product_images: z.array(z.string()).nullish(),
  product_nova_group: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullish(),
  product_ecoscore: schema_tool_product_lookup_score.nullish(),
  product_nutriscore: schema_tool_product_lookup_score.nullish(),
  product_metadata: z
    .object({
      ingredients: z.array(z.string()).nullish(),
      allergens: z.array(z.string()).nullish(),
    })
    .nullish(),
  nutrition: schema_tool_product_lookup_nutrition.nullish(),
})

export const schema_tool_product_lookup_provider_product_result = z.object({
  products: z.array(schema_tool_product_lookup_record),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().min(1).max(5),
})

export const schema_tool_product_lookup_provider_brand_result = schema_tool_product_lookup_provider_product_result.extend({
  brand_name: z.string().min(1),
})

export const schema_tool_product_lookup_provider_availability = z.object({
  available: z.boolean().default(true),
  issue: z.enum(['configuration', 'temporarily_unavailable']).nullable().default(null),
})

export const dto_tool_product_lookup = {
  nutrition_by_barcode: z.object({
    barcode: z
      .string()
      .regex(/^\d{6,64}$/)
      .describe('Exact numeric barcode for the product variant whose nutrition facts are needed'),
  }),

  local_by_barcode: z.object({
    barcode: z
      .string()
      .regex(/^\d{6,64}$/)
      .describe('Numeric product barcode containing between 6 and 64 digits'),
  }),

  local_by_name: z.object({
    product_name: z.string().min(2).max(255).describe('Full or partial product name'),
  }),

  provider_by_barcode: z.object({
    barcode: z
      .string()
      .regex(/^\d{6,64}$/)
      .describe('Numeric barcode to look up on Open Food Facts'),
  }),

  provider_by_product_name: z.object({
    product_name: z.string().trim().min(2).max(255).describe('Product name to search on Open Food Facts'),
    page: z.number().int().min(1).max(1000).optional().describe('One-based Open Food Facts result page; defaults to 1'),
  }),

  provider_by_brand_name: z.object({
    brand_name: z.string().trim().min(2).max(255).describe('Brand name to search on Open Food Facts'),
    page: z.number().int().min(1).max(1000).optional().describe('One-based Open Food Facts result page; defaults to 1'),
  }),

  brand_by_name: z.object({
    brand_name: z.string().min(2).max(255).describe('Full or partial brand name'),
  }),
}
