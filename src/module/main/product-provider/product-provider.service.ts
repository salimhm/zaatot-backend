import type { Static } from 'elysia'

import { lib_error } from '@lib/error.lib'

import { dto_product_provider } from '@module/main/product-provider/product-provider.dto'

export const service_product_provider = {
  async fetch_by_barcode(barcode: string): Promise<Static<typeof dto_product_provider.fetch_by_barcode.response>['data']> {
    const user_agent = process.env.OPEN_FOOD_FACTS_USER_AGENT
    if (!user_agent) {
      throw lib_error.open_food_facts_configuration
    }

    const base_url = process.env.OPEN_FOOD_FACTS_BASE_URL || 'https://world.openfoodfacts.org'
    const timeout_ms = Number(process.env.OPEN_FOOD_FACTS_TIMEOUT_MS) || 8000

    const controller = new AbortController()
    const timeout_id = setTimeout(() => controller.abort(), timeout_ms)

    try {
      const response = await fetch(`${base_url}/api/v2/product/${barcode}.json`, {
        headers: {
          'User-Agent': user_agent,
        },
        signal: controller.signal,
      })

      clearTimeout(timeout_id)

      if (!response.ok) {
        return null
      }

      const body = (await response.json()) as {
        status?: number
        product?: {
          product_name?: string
          brands?: string
          image_url?: string
          image_front_url?: string
          image_ingredients_url?: string
          image_nutrition_url?: string
          ecoscore_grade?: string
          nutriscore_grade?: string
          nova_group?: number | string
          ingredients_tags?: string[]
          allergens_tags?: string[]
        }
      }

      if (body.status === 0 || !body.product) {
        return null
      }

      const product = body.product
      const product_name = typeof product.product_name === 'string' && product.product_name.trim() !== '' ? product.product_name.trim() : null
      const product_brand_name = typeof product.brands === 'string' && product.brands.trim() !== '' ? product.brands.trim() : null

      const image_candidates = [product.image_url, product.image_front_url, product.image_ingredients_url, product.image_nutrition_url]

      const product_images = Array.from(
        new Set(
          image_candidates
            .filter((img): img is string => typeof img === 'string' && img.trim() !== '' && img.length <= 1024)
            .map((img) => img.trim()),
        ),
      )

      const ecoscore_val =
        typeof product.ecoscore_grade === 'string' && product.ecoscore_grade.trim() !== '' ? product.ecoscore_grade.trim().toLowerCase() : null
      const ecoscore = ecoscore_val && ['a', 'b', 'c', 'd', 'e'].includes(ecoscore_val) ? (ecoscore_val as 'a' | 'b' | 'c' | 'd' | 'e') : null

      const nutriscore_val =
        typeof product.nutriscore_grade === 'string' && product.nutriscore_grade.trim() !== '' ? product.nutriscore_grade.trim().toLowerCase() : null
      const nutriscore = nutriscore_val && ['a', 'b', 'c', 'd', 'e'].includes(nutriscore_val) ? (nutriscore_val as 'a' | 'b' | 'c' | 'd' | 'e') : null

      let nova_group: 1 | 2 | 3 | 4 | null = null
      if (product.nova_group !== undefined && product.nova_group !== null) {
        const parsed_nova = Number(product.nova_group)
        if (!isNaN(parsed_nova) && [1, 2, 3, 4].includes(parsed_nova)) {
          nova_group = parsed_nova as 1 | 2 | 3 | 4
        }
      }

      const ingredients = Array.isArray(product.ingredients_tags)
        ? product.ingredients_tags
            .filter((tag: unknown): tag is string => typeof tag === 'string')
            .map((tag: string) => tag.replace(/^[^:]+:/, '').trim())
            .filter((tag: string) => tag !== '')
        : null

      const allergens = Array.isArray(product.allergens_tags)
        ? product.allergens_tags
            .filter((tag: unknown): tag is string => typeof tag === 'string')
            .map((tag: string) => tag.replace(/^[^:]+:/, '').trim())
            .filter((tag: string) => tag !== '')
        : []

      return {
        product_barcode: barcode,
        product_type: 'food',
        product_name,
        product_brand_name,
        product_images: product_images.length > 0 ? product_images : null,
        product_nova_group: nova_group,
        product_ecoscore: ecoscore,
        product_nutriscore: nutriscore,
        product_metadata: {
          ingredients: ingredients && ingredients.length > 0 ? ingredients : null,
          allergens,
        },
      }
    } catch {
      clearTimeout(timeout_id)
      return null
    }
  },
}
