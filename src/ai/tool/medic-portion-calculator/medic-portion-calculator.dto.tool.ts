import { z } from 'zod'

export const schema_tool_medic_portion_input = z
  .object({
    value: z.number().finite().positive(),
    unit: z.enum(['mg', 'g', 'kg', 'ml', 'l', 'serving']),
  })
  .strict()

export const schema_tool_medic_portion = z
  .object({
    value: z.number().finite().positive(),
    unit: z.enum(['g', 'ml', 'serving']),
  })
  .strict()

export const schema_tool_medic_verified_nutrition = z
  .object({
    variant: z
      .object({
        product_id: z.number().int().positive(),
        product_barcode: z.string().regex(/^\d{6,64}$/),
        product_name: z.string().nullable(),
      })
      .strict(),
    serving: z
      .object({
        value: z.number().finite().positive(),
        unit: z.string().min(1),
      })
      .nullable(),
    nutrients: z.array(
      z
        .object({
          code: z.string().min(1),
          value: z.number().finite().nonnegative(),
          unit: z.string().min(1),
          basis: z.enum(['per_100g', 'per_100ml', 'per_serving']),
        })
        .strict(),
    ),
    sources: z.array(
      z
        .object({
          provider: z.string().min(1),
          url: z.string().nullable(),
          retrieved_at: z.string().min(1),
          fresh_until: z.string().nullable(),
        })
        .strict(),
    ),
    completeness: z
      .object({
        status: z.enum(['complete', 'partial', 'unavailable']),
        complete: z.boolean(),
        missing_nutrient_codes: z.array(z.string().min(1)),
      })
      .strict(),
  })
  .strict()

export const schema_tool_medic_portion_calculation = z
  .object({
    status: z.enum(['calculated', 'insufficient_data']),
    variant: z
      .object({
        barcode: z.string().regex(/^\d{6,64}$/),
        name: z.string().nullable(),
      })
      .strict()
      .nullable(),
    requested_portion: schema_tool_medic_portion,
    nutrient_quantities: z.array(
      z
        .object({
          code: z.string().min(1),
          value: z.number().finite().nonnegative(),
          unit: z.string().min(1),
          source_basis: z.enum(['per_100g', 'per_100ml', 'per_serving']),
        })
        .strict(),
    ),
    unavailable_nutrient_codes: z.array(z.string().min(1)),
    sources: z.array(
      z
        .object({
          provider: z.string().min(1),
          url: z.string().nullable(),
          retrieved_at: z.string().min(1),
          fresh_until: z.string().nullable(),
        })
        .strict(),
    ),
    missing_information: z.array(z.string().min(1)),
    limitations: z.array(z.string().min(1)),
  })
  .strict()
  .superRefine((result, context) => {
    if (
      result.status === 'calculated' &&
      (result.variant === null || result.nutrient_quantities.length === 0 || result.missing_information.length > 0)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A successful portion calculation requires an exact variant, quantities, and no blocking missing information.',
      })
    }
    if (result.status === 'insufficient_data' && result.missing_information.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['missing_information'],
        message: 'Explain what prevents the requested calculation.',
      })
    }
  })

export const dto_tool_medic_portion_calculator = {
  calculate: z
    .object({
      barcode: z
        .string()
        .regex(/^\d{6,64}$/)
        .describe('Exact barcode of the resolved product variant.'),
      portion: schema_tool_medic_portion_input.describe('Requested amount to calculate. Do not provide a nutrient threshold or daily target.'),
    })
    .strict(),
  nutrition: schema_tool_medic_verified_nutrition,
  calculation: schema_tool_medic_portion_calculation,
}
