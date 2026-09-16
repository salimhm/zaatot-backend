import { z } from 'zod'

export const dto_tool_product_lookup = {
  local_by_barcode: z.object({
    barcode: z
      .string()
      .regex(/^\d{6,64}$/)
      .describe('Numeric product barcode containing between 6 and 64 digits'),
  }),

  local_by_name: z.object({
    product_name: z
      .string()
      .min(2)
      .max(255)
      .describe('Full or partial product name'),
  }),

  provider_by_barcode: z.object({
    barcode: z
      .string()
      .regex(/^\d{6,64}$/)
      .describe('Numeric barcode to look up on Open Food Facts'),
  }),

  brand_by_name: z.object({
    brand_name: z
      .string()
      .min(2)
      .max(255)
      .describe('Full or partial brand name'),
  }),
}
