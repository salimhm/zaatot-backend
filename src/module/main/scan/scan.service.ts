import type { lib_dto_payload } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { lib_error } from '@lib/error.lib'

import { service_boycott_provider } from '@module/main/boycott-provider/boycott-provider.service'
import { service_brand } from '@module/main/brand/brand.service'
import { service_product_provider } from '@module/main/product-provider/product-provider.service'
import { service_product } from '@module/main/product/product.service'
import { dto_scan } from '@module/main/scan/scan.dto'
import { service_scan_history } from '@module/user/scan-history/scan-history.service'

const scan_product_columns = [
  'product_id',
  'product_barcode',
  'product_type',
  'product_name',
  'brand_id',
  'product_images',
  'product_nova_group',
  'product_ecoscore',
  'product_nutriscore',
  'product_metadata',
  'updated_at',
  'created_at',
  'brand_name',
  'brand_is_boycotted',
  'brand_boycott_reasons',
  'brand_boycott_alternatives',
] as const

function get_scan_barcode_from_text(value: string) {
  return value.match(/\b\d{6,64}\b/)?.[0] || null
}

function normalize_scan_value(scan_value: string): Static<typeof dto_scan.identify.response>['data']['scan'] {
  const raw_value = scan_value.trim()

  if (/^\d{6,64}$/.test(raw_value)) {
    return {
      scan_type: 'barcode',
      raw_value,
      barcode: raw_value,
      query: null,
    }
  }

  try {
    const url = new URL(raw_value)
    const query_barcode = ['barcode', 'gtin', 'code', 'product_code']
      .map((key) => url.searchParams.get(key))
      .find((value) => value && /^\d{6,64}$/.test(value))
    const barcode = query_barcode || get_scan_barcode_from_text(`${url.pathname} ${url.hash}`)

    return {
      scan_type: 'url',
      raw_value,
      barcode,
      query: barcode ? null : raw_value,
    }
  } catch {
    return {
      scan_type: raw_value ? 'text' : 'unknown',
      raw_value,
      barcode: null,
      query: raw_value || null,
    }
  }
}

async function resolve_product_by_barcode(barcode: string): Promise<Static<typeof dto_scan.barcode.response>['data']> {
  let product: any = null

  try {
    const existing_res = await service_product.find({
      columns: [...scan_product_columns],
      product_barcode: [barcode],
      take: 1,
    })

    const found_product = existing_res.data[0]
    if (found_product) {
      product = found_product
    }
  } catch (error: unknown) {
    const err = error as { code?: string }
    if (err?.code !== 'not-found' && err?.code !== 'not-found-product') {
      throw error
    }
  }

  if (product != null) {
    return {
      product: product as any,
      source: 'cache',
    }
  }

  const provider_product = await service_product_provider.fetch_by_barcode(barcode)
  if (!provider_product) {
    throw lib_error.not_found
  }

  let brand = null
  if (provider_product.product_brand_name) {
    brand = await service_brand.find_or_create_by_name(provider_product.product_brand_name)
  }

  const new_product_res = await service_product.create({
    product_barcode: provider_product.product_barcode,
    product_type: provider_product.product_type as any,
    product_name: provider_product.product_name || undefined,
    brand_id: brand ? brand.brand_id : undefined,
    product_images: provider_product.product_images || undefined,
    product_nova_group: provider_product.product_nova_group ?? undefined,
    product_ecoscore: provider_product.product_ecoscore ?? undefined,
    product_nutriscore: provider_product.product_nutriscore ?? undefined,
    product_metadata: provider_product.product_metadata || undefined,
  })

  const new_product = new_product_res.data

  return {
    product: {
      ...new_product,
      brand_name: brand ? brand.brand_name : null,
      brand_is_boycotted: brand ? brand.brand_is_boycotted : null,
      brand_boycott_reasons: brand ? brand.brand_boycott_reasons : null,
      brand_boycott_alternatives: brand ? brand.brand_boycott_alternatives : null,
    } as any,
    source: 'provider',
  }
}

async function record_scan_history(product: Static<typeof dto_scan.barcode.response>['data']['product'], barcode: string, payload: lib_dto_payload) {
  if (product == null || product.product_id == null) {
    throw lib_error.bad_request
  }

  await service_scan_history.create(
    {
      product_id: product.product_id,
      product_barcode: barcode,
    },
    payload,
  )
}

function get_clean_text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalize_match_text(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function push_unique_candidate(candidates: string[], value: string | undefined) {
  if (!value) return

  const normalized = value.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (normalized.length < 2) return

  if (!candidates.some((candidate) => normalize_match_text(candidate) === normalize_match_text(normalized))) {
    candidates.push(normalized)
  }
}

function get_product_decision_input(product: Static<typeof dto_scan.barcode.response>['data']['product']) {
  if (product == null) {
    return null
  }

  const brand_name = get_clean_text(product.brand_name)
  const product_name = get_clean_text(product.product_name)

  if (!brand_name && !product_name) {
    return null
  }

  return {
    provider: 'boycat' as const,
    brand_name,
    product_name,
  }
}

function get_boycott_search_candidates(product: Static<typeof dto_scan.barcode.response>['data']['product']) {
  const candidates: string[] = []
  const brand_name = get_clean_text(product?.brand_name)
  const product_name = get_clean_text(product?.product_name)

  if (brand_name) {
    const brand_parts = brand_name
      .split(/[,;|]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .sort((a, b) => a.length - b.length)

    for (const part of brand_parts) {
      push_unique_candidate(candidates, part)
    }

    push_unique_candidate(candidates, brand_name)
  }

  push_unique_candidate(candidates, product_name)

  return candidates.slice(0, 6)
}

async function sync_brand_boycott_snapshot(
  product: Static<typeof dto_scan.barcode.response>['data']['product'],
  decision: Static<typeof dto_scan.identify.response>['data']['boycott_decision'],
) {
  if (product == null || decision == null || product.brand_id == null || decision.provider_status !== 'matched') {
    return
  }

  try {
    await service_brand.update({
      brand_id: product.brand_id,
      brand_is_boycotted: decision.decision_status === 'boycott',
      brand_boycott_reasons: decision.reason ? [decision.reason] : [],
      brand_boycott_alternatives: decision.alternatives.map((alternative) => alternative.name),
    })
  } catch {
    return
  }
}

async function find_boycat_brand_from_search(product: Static<typeof dto_scan.barcode.response>['data']['product']) {
  let best_result: { brand_name: string; confidence: number } | null = null

  for (const query of get_boycott_search_candidates(product)) {
    const search = await service_boycott_provider.search({ provider: 'boycat', query })
    const results = search.data.results

    if (results.length === 0) continue

    const exact_result = results.find((result) => normalize_match_text(result.brand_name) === normalize_match_text(query))
    const result = exact_result || results[0]
    if (!result) continue

    const score = result.confidence + (exact_result ? 10 : 0)
    if (!best_result || score > best_result.confidence) {
      best_result = {
        brand_name: result.brand_name,
        confidence: score,
      }
    }
  }

  return best_result?.brand_name || null
}

async function resolve_boycott_decision(product: Static<typeof dto_scan.barcode.response>['data']['product']) {
  const decision_input = get_product_decision_input(product)

  if (!decision_input) {
    return {
      boycott_decision: null,
      boycott_source: 'not_requested' as const,
    }
  }

  const direct_decision = await service_boycott_provider.decide(decision_input)
  if (direct_decision.data.provider_status === 'matched') {
    await sync_brand_boycott_snapshot(product, direct_decision.data)

    return {
      boycott_decision: direct_decision.data,
      boycott_source: 'provider' as const,
    }
  }

  const searched_brand_name = await find_boycat_brand_from_search(product)
  if (searched_brand_name) {
    const searched_decision = await service_boycott_provider.decide({
      provider: 'boycat',
      brand_name: searched_brand_name,
      product_name: decision_input.product_name,
    })

    if (searched_decision.data.provider_status === 'matched') {
      await sync_brand_boycott_snapshot(product, searched_decision.data)

      return {
        boycott_decision: searched_decision.data,
        boycott_source: 'provider' as const,
      }
    }
  }

  return {
    boycott_decision: direct_decision.data,
    boycott_source: 'unavailable' as const,
  }
}

export const service_scan = {
  async scan_barcode(body: Static<typeof dto_scan.barcode.body>, payload: lib_dto_payload): Promise<Static<typeof dto_scan.barcode.response>> {
    const { barcode } = body
    const result = await resolve_product_by_barcode(barcode)

    await record_scan_history(result.product, barcode, payload)

    return {
      data: result,
    }
  },

  async identify(body: Static<typeof dto_scan.identify.body>, payload: lib_dto_payload): Promise<Static<typeof dto_scan.identify.response>> {
    const scan = normalize_scan_value(body.scan_value)

    if (scan.barcode) {
      const product_result = await resolve_product_by_barcode(scan.barcode)
      await record_scan_history(product_result.product, scan.barcode, payload)

      const boycott_result = await resolve_boycott_decision(product_result.product)

      return {
        data: {
          scan,
          product: product_result.product,
          boycott_decision: boycott_result.boycott_decision,
          boycott_search: null,
          source: {
            product: product_result.source,
            boycott: boycott_result.boycott_source,
          },
        },
      }
    }

    if (scan.query) {
      const search = await service_boycott_provider.search({ provider: 'boycat', query: scan.query })

      return {
        data: {
          scan,
          product: null,
          boycott_decision: null,
          boycott_search: search.data,
          source: {
            product: null,
            boycott: search.data.provider_status === 'matched' ? 'search' : 'unavailable',
          },
        },
      }
    }

    return {
      data: {
        scan,
        product: null,
        boycott_decision: null,
        boycott_search: null,
        source: {
          product: null,
          boycott: 'not_requested',
        },
      },
    }
  },
}
