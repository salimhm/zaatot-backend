import { z } from 'zod'

export const schema_agent_product_brand_lookup = z.object({
  query_type: z.enum(['product', 'brand', 'unknown']),
  found: z.boolean(),
  message: z.string().describe("The assistant's factual response"),
})

export type type_schema_agent_product_brand_lookup = z.infer<
  typeof schema_agent_product_brand_lookup
>