import { z } from 'zod'

export const schema_tool_vault_keeper_context_profile = z
  .object({
    goals: z.array(z.string()).max(21),
    allergens: z.array(z.string()).max(20),
    avoided_ingredients: z.array(z.string()).max(30),
    diets: z.array(z.string()).max(10),
  })
  .strict()

export const schema_tool_vault_keeper_context_result = z
  .object({
    permissions: z
      .object({
        personalization: z.boolean(),
        history: z.boolean(),
      })
      .strict(),
    profile: schema_tool_vault_keeper_context_profile.nullable(),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.permissions.personalization !== (result.profile !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['permissions', 'personalization'],
        message: 'Personalization is permitted only when a minimized profile is available.',
      })
    }
  })

export const dto_tool_vault_keeper_context = {
  read: z
    .object({
      personalization: z.boolean().describe('Whether the current request needs the user’s permitted product-fit profile.'),
      history: z.boolean().describe('Whether the current request needs permission to use product-fit history.'),
    })
    .strict()
    .superRefine((query, context) => {
      if (!query.personalization && !query.history) {
        context.addIssue({
          code: 'custom',
          message: 'Request at least one permitted context scope.',
        })
      }
    }),
  result: schema_tool_vault_keeper_context_result,
}
