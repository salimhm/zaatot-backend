import { z } from 'zod'

import { schema_agent_medic } from '@agent/medic/medic.schema.agent'
import { schema_tool_vault_keeper_context_profile } from '@tool/vault-keeper/vault-keeper-context.dto.tool'

export const schema_tool_medic_restriction_checker_composition = z
  .object({
    variant: z
      .object({
        product_id: z.number().int().positive(),
        product_barcode: z.string().regex(/^\d{6,64}$/),
        product_name: z.string().nullable(),
      })
      .strict(),
    ingredients: z.array(z.string().min(1)),
    allergens: z.array(z.string().min(1)),
    completeness: z
      .object({
        ingredients: z.boolean(),
        allergens: z.boolean(),
      })
      .strict(),
    source: z
      .object({
        provider: z.string().min(1),
        url: z.string().nullable(),
        retrieved_at: z.string().min(1),
        fresh_until: z.string().nullable(),
      })
      .strict(),
  })
  .strict()

export const dto_tool_medic_restriction_checker = {
  check: z
    .object({
      barcode: z
        .string()
        .regex(/^\d{6,64}$/)
        .describe('Exact barcode of the already resolved product variant.'),
    })
    .strict(),
  profile: schema_tool_vault_keeper_context_profile,
  composition: schema_tool_medic_restriction_checker_composition,
  result: schema_agent_medic,
}
