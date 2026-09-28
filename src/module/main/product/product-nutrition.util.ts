export const product_nutrition_required_codes = [
  'energy-kcal',
  'fat',
  'saturated-fat',
  'carbohydrates',
  'sugars',
  'fiber',
  'proteins',
  'salt',
] as const

export type product_nutrition_measurement = {
  code: string
  basis: string
}

export const product_nutrition_completeness = (nutrients: product_nutrition_measurement[], declared_complete = false) => {
  const standard_basis = new Set(['per_100g', 'per_100ml'])
  const present = new Set(nutrients.filter((nutrient) => standard_basis.has(nutrient.basis)).map((nutrient) => nutrient.code))
  const missing_nutrient_codes = product_nutrition_required_codes.filter((code) => !present.has(code))
  const complete = nutrients.length > 0 && (declared_complete || missing_nutrient_codes.length === 0)

  return {
    status: complete ? ('complete' as const) : nutrients.length > 0 ? ('partial' as const) : ('unavailable' as const),
    complete,
    missing_nutrient_codes,
  }
}
