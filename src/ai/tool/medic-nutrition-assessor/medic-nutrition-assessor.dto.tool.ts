import { z } from 'zod'

import { schema_tool_product_lookup_nutrition } from '@tool/product-lookup/product-lookup.dto.tool'

export const enum_medic_nutrition_assessor_nutrients = ['fat', 'saturated-fat', 'sugars', 'salt'] as const

export const schema_tool_medic_nutrition_assessor_source = z
  .object({
    provider: z.string().min(1),
    url: z.string().url().nullable(),
    retrieved_at: z.string().min(1),
    fresh_until: z.string().min(1).nullable(),
  })
  .strict()

export const schema_tool_medic_nutrition_assessor_finding = z
  .object({
    nutrient: z.enum(enum_medic_nutrition_assessor_nutrients),
    label: z.string().min(1),
    source_measurement: z
      .object({
        value: z.number().finite().nonnegative(),
        unit: z.string().min(1),
        basis: z.enum(['per_100g', 'per_100ml']),
        nutrient_index: z.number().int().nonnegative(),
      })
      .strict(),
    normalized_value_g: z.number().finite().nonnegative(),
    level: z.enum(['low', 'medium', 'high']),
    threshold: z
      .object({
        low_at_or_below_g_per_100: z.number().finite().nonnegative(),
        high_above_g_per_100: z.number().finite().positive(),
        high_per_portion_above_g: z.number().finite().positive(),
        portion_threshold_applied: z.boolean(),
      })
      .strict(),
    rule_id: z.string().min(1),
    evidence_ref: z.string().min(1),
  })
  .strict()

export const schema_tool_medic_nutrition_assessment = z
  .object({
    status: z.enum(['assessed', 'partial', 'insufficient_data']),
    ruleset: z
      .object({
        id: z.literal('uk_front_of_pack_traffic_light_v1'),
        name: z.literal('UK front-of-pack traffic-light nutrient screen'),
        authority: z.literal('UK Department of Health and Social Care'),
        reference_url: z.string().url(),
      })
      .strict(),
    variant: z
      .object({
        barcode: z.string().regex(/^\d{6,64}$/),
        name: z.string().nullable(),
      })
      .strict()
      .nullable(),
    nutrition_basis: z.enum(['per_100g', 'per_100ml']).nullable(),
    classification: z.enum(['favourable', 'mixed', 'less_favourable', 'inconclusive']),
    findings: z.array(schema_tool_medic_nutrition_assessor_finding),
    missing_nutrient_codes: z.array(z.enum(enum_medic_nutrition_assessor_nutrients)),
    sources: z.array(schema_tool_medic_nutrition_assessor_source),
    missing_information: z.array(z.string().min(1)),
    limitations: z.array(z.string().min(1)),
  })
  .strict()
  .superRefine((result, context) => {
    const all_core_nutrients_present = result.missing_nutrient_codes.length === 0 && result.findings.length === 4

    if (result.status === 'assessed') {
      if (result.variant === null || result.nutrition_basis === null || !all_core_nutrients_present || result.missing_information.length > 0) {
        context.addIssue({
          code: 'custom',
          message:
            'A completed assessment requires one exact variant, one standard basis, all four core nutrients, and no blocking missing information.',
        })
      }
      if (result.classification === 'inconclusive') {
        context.addIssue({ code: 'custom', path: ['classification'], message: 'A completed assessment must return a supported classification.' })
      }
    }

    if (result.status === 'partial') {
      if (result.variant === null || result.nutrition_basis === null || result.findings.length === 0 || result.missing_information.length === 0) {
        context.addIssue({
          code: 'custom',
          message: 'A partial assessment requires an exact variant, usable findings, and an explanation of the incomplete evidence.',
        })
      }
      if (result.classification === 'favourable' || result.classification === 'mixed') {
        context.addIssue({
          code: 'custom',
          path: ['classification'],
          message: 'Partial evidence cannot support a favourable or mixed product classification.',
        })
      }
    }

    if (result.status === 'insufficient_data') {
      if (
        result.nutrition_basis !== null ||
        result.findings.length > 0 ||
        result.classification !== 'inconclusive' ||
        result.missing_information.length === 0
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Insufficient data must not contain an assessment and must explain what is unavailable.',
        })
      }
    }
  })

export const dto_tool_medic_nutrition_assessor = {
  assess: z
    .object({
      barcode: z
        .string()
        .regex(/^\d{6,64}$/)
        .describe(
          'Exact barcode of the already resolved product variant. The ruleset is fixed by the application and cannot be selected by the model.',
        ),
    })
    .strict(),
  nutrition: schema_tool_product_lookup_nutrition,
  assessment: schema_tool_medic_nutrition_assessment,
}
