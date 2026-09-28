import { describe, expect, it } from 'bun:test'

import { product_nutrition_completeness } from '@module/main/product/product-nutrition.util'

describe('Product nutrition completeness', () => {
  it('reports complete only when every required nutrient has a standard comparison basis', () => {
    expect(
      product_nutrition_completeness([
        { code: 'energy-kcal', basis: 'per_100ml' },
        { code: 'fat', basis: 'per_100ml' },
        { code: 'saturated-fat', basis: 'per_100ml' },
        { code: 'carbohydrates', basis: 'per_100ml' },
        { code: 'sugars', basis: 'per_100ml' },
        { code: 'fiber', basis: 'per_100ml' },
        { code: 'proteins', basis: 'per_100ml' },
        { code: 'salt', basis: 'per_100ml' },
      ]),
    ).toEqual({ status: 'complete', complete: true, missing_nutrient_codes: [] })
  })

  it('distinguishes partial and unavailable nutrition facts', () => {
    expect(product_nutrition_completeness([{ code: 'sugars', basis: 'per_serving' }])).toMatchObject({
      status: 'partial',
      complete: false,
    })
    expect(product_nutrition_completeness([])).toEqual({
      status: 'unavailable',
      complete: false,
      missing_nutrient_codes: ['energy-kcal', 'fat', 'saturated-fat', 'carbohydrates', 'sugars', 'fiber', 'proteins', 'salt'],
    })
  })
})
