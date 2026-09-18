import { t } from 'elysia'

export const dto_schema_product_fit_vault = t.Object({
  version: t.String(),
  profile: t.Union([
    t.Null(),
    t.Object({
      goals: t.Array(t.String()),
      allergens: t.Array(t.String()),
      avoided_ingredients: t.Array(t.String()),
      diets: t.Array(t.String()),
    }),
  ]),
  history_allowed: t.Boolean(),
})
export const dto_product_fit_vault = {
  find: {
    query: t.Object({ personalization: t.Boolean(), history: t.Boolean() }),
    response: dto_schema_product_fit_vault,
  },
}
