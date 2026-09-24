import type { Static } from 'elysia'

import { lib_error } from '@lib/error.lib'

import { dto_product_provider } from '@module/main/product-provider/product-provider.dto'

type provider_product = Static<typeof dto_product_provider.fetch_by_barcode.response>['data']
type raw_open_food_facts_product = {
  code?: string | number
  product_name?: string
  brands?: string
  image_url?: string
  image_front_url?: string
  image_ingredients_url?: string
  image_nutrition_url?: string
  ecoscore_grade?: string
  nutrition_grades?: string
  nutriscore_grade?: string
  nova_group?: number | string
  ingredients_tags?: string[]
  allergens_tags?: string[]
}

const search_fields = [
  'code',
  'product_name',
  'brands',
  'image_url',
  'image_front_url',
  'image_ingredients_url',
  'image_nutrition_url',
  'ecoscore_grade',
  'nutrition_grades',
  'nutriscore_grade',
  'nova_group',
  'ingredients_tags',
  'allergens_tags',
].join(',')

const retryable_statuses = new Set([429, 500, 502, 503, 504])

function open_food_facts_unavailable(provider_status?: number) {
  return Object.assign(new Error('Open Food Facts is temporarily unavailable'), {
    status: 503,
    code: 'open-food-facts-unavailable',
    provider_status,
  })
}

function retry_base_ms(): number {
  const configured_base = Number(process.env.OPEN_FOOD_FACTS_RETRY_BASE_MS)
  return Number.isFinite(configured_base) && configured_base >= 0 ? Math.min(configured_base, 2_000) : 250
}

function retry_delay_ms(response: Response, attempt: number): number {
  const retry_after = response.headers.get('Retry-After')
  const retry_after_seconds = retry_after === null ? Number.NaN : Number(retry_after)

  if (Number.isFinite(retry_after_seconds) && retry_after_seconds >= 0) return Math.min(retry_after_seconds * 1_000, 2_000)
  return Math.min(retry_base_ms() * 2 ** attempt, 2_000)
}

async function wait_for_retry(delay_ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const on_abort = () => {
      clearTimeout(timeout)
      reject(signal?.reason)
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', on_abort)
      resolve()
    }, delay_ms)
    signal?.addEventListener('abort', on_abort, { once: true })
  })
}

function normalize_name(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function to_brand_tag(value: string): string {
  return normalize_name(value).replace(/ /g, '-')
}

function normalize_score(value: unknown): 'a' | 'b' | 'c' | 'd' | 'e' | null {
  const score = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return ['a', 'b', 'c', 'd', 'e'].includes(score) ? (score as 'a' | 'b' | 'c' | 'd' | 'e') : null
}

function normalize_tags(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const tags = value
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.replace(/^[^:]+:/, '').trim())
    .filter((tag) => tag !== '')
  return tags.length > 0 ? tags : null
}

function normalize_brand_names(value: unknown): string[] {
  if (typeof value !== 'string') return []

  const names: string[] = []
  const keys = new Set<string>()
  for (const candidate of value.split(/[,;|]/)) {
    const name = candidate.trim()
    const key = normalize_name(name)
    if (!name || !key || keys.has(key)) continue
    keys.add(key)
    names.push(name)
    if (names.length === 5) break
  }
  return names
}

function normalize_product(product: raw_open_food_facts_product, fallback_barcode?: string): Exclude<provider_product, null> | null {
  const raw_barcode = product.code ?? fallback_barcode
  const product_barcode = raw_barcode === undefined || raw_barcode === null ? '' : String(raw_barcode).trim()
  if (!/^\d{6,64}$/.test(product_barcode)) return null

  const product_name = typeof product.product_name === 'string' && product.product_name.trim() !== '' ? product.product_name.trim() : null
  const product_brand_name = typeof product.brands === 'string' && product.brands.trim() !== '' ? product.brands.trim() : null
  const product_brand_names = normalize_brand_names(product.brands)
  const image_candidates = [product.image_url, product.image_front_url, product.image_ingredients_url, product.image_nutrition_url]
  const product_images = Array.from(
    new Set(
      image_candidates
        .filter((image): image is string => typeof image === 'string' && image.trim() !== '' && image.length <= 1024)
        .map((image) => image.trim()),
    ),
  )

  const parsed_nova = Number(product.nova_group)
  const product_nova_group = [1, 2, 3, 4].includes(parsed_nova) ? (parsed_nova as 1 | 2 | 3 | 4) : null
  const ingredients = normalize_tags(product.ingredients_tags)
  const allergens = normalize_tags(product.allergens_tags) ?? []

  return {
    product_barcode,
    product_type: 'food',
    product_name,
    product_brand_name,
    product_brand_names,
    product_images: product_images.length > 0 ? product_images : null,
    product_nova_group,
    product_ecoscore: normalize_score(product.ecoscore_grade),
    product_nutriscore: normalize_score(product.nutriscore_grade ?? product.nutrition_grades),
    product_metadata: { ingredients, allergens },
  }
}

async function request_open_food_facts(
  path: string,
  parameters?: URLSearchParams,
  allow_not_found = false,
  signal?: AbortSignal,
): Promise<unknown | null> {
  const user_agent = process.env.OPEN_FOOD_FACTS_USER_AGENT
  if (!user_agent) throw lib_error.open_food_facts_configuration

  const base_url = process.env.OPEN_FOOD_FACTS_BASE_URL || 'https://world.openfoodfacts.org'
  const timeout_ms = Number(process.env.OPEN_FOOD_FACTS_TIMEOUT_MS) || 8000
  const configured_retries = Number(process.env.OPEN_FOOD_FACTS_MAX_RETRIES)
  const max_retries = Number.isInteger(configured_retries) && configured_retries >= 0 ? Math.min(configured_retries, 2) : 2
  const url = new URL(path, base_url)
  if (parameters) url.search = parameters.toString()

  for (let attempt = 0; attempt <= max_retries; attempt++) {
    signal?.throwIfAborted()
    const timeout_signal = AbortSignal.timeout(timeout_ms)
    const request_signal = signal ? AbortSignal.any([signal, timeout_signal]) : timeout_signal

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': user_agent },
        signal: request_signal,
      })
      if (response.ok) return await response.json()
      if (allow_not_found && response.status === 404) return null

      if (retryable_statuses.has(response.status) && attempt < max_retries) {
        await wait_for_retry(retry_delay_ms(response, attempt), signal)
        continue
      }

      throw open_food_facts_unavailable(response.status)
    } catch (error) {
      if (signal?.aborted) signal.throwIfAborted()
      if ((error as { code?: string })?.code === 'open-food-facts-unavailable') throw error
      if (attempt < max_retries) {
        await wait_for_retry(Math.min(retry_base_ms() * 2 ** attempt, 2_000), signal)
        continue
      }
      throw open_food_facts_unavailable()
    }
  }

  throw open_food_facts_unavailable()
}

function normalize_search_products(body: unknown, take: number): Exclude<provider_product, null>[] {
  if (!body || typeof body !== 'object' || !('products' in body) || !Array.isArray(body.products)) return []

  return body.products
    .map((product) => (product && typeof product === 'object' ? normalize_product(product as raw_open_food_facts_product) : null))
    .filter((product): product is Exclude<provider_product, null> => product !== null)
    .slice(0, take)
}

function normalize_search_page(body: unknown, take: number) {
  const products = normalize_search_products(body, take)
  if (!body || typeof body !== 'object') return { products, total: products.length, page: 1, page_size: take }

  const raw = body as { count?: unknown; page?: unknown; page_size?: unknown }
  const count = Number(raw.count)
  const page = Number(raw.page)
  const page_size = Number(raw.page_size)

  return {
    products,
    total: Number.isInteger(count) && count >= products.length ? count : products.length,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    page_size: Number.isInteger(page_size) && page_size >= 1 && page_size <= take ? page_size : take,
  }
}

export const service_product_provider = {
  async fetch_by_barcode(barcode: string, signal?: AbortSignal): Promise<Static<typeof dto_product_provider.fetch_by_barcode.response>['data']> {
    const body = await request_open_food_facts(`/api/v2/product/${encodeURIComponent(barcode)}.json`, undefined, true, signal)
    if (!body || typeof body !== 'object' || !('status' in body) || body.status === 0 || !('product' in body) || !body.product) return null
    if (typeof body.product !== 'object') return null
    return normalize_product(body.product as raw_open_food_facts_product, barcode)
  },

  async search_by_product_name(
    query: Static<typeof dto_product_provider.search_by_product_name.query>,
    signal?: AbortSignal,
  ): Promise<Static<typeof dto_product_provider.search_by_product_name.response>['data']> {
    const take = query.take ?? 5
    const parameters = new URLSearchParams({
      search_terms: query.product_name.trim(),
      search_simple: '1',
      action: 'process',
      json: '1',
      page: String(query.page ?? 1),
      page_size: String(take),
      fields: search_fields,
    })
    const body = await request_open_food_facts('/cgi/search.pl', parameters, false, signal)
    return normalize_search_page(body, take)
  },

  async search_by_brand_name(
    query: Static<typeof dto_product_provider.search_by_brand_name.query>,
    signal?: AbortSignal,
  ): Promise<Static<typeof dto_product_provider.search_by_brand_name.response>['data']> {
    const take = query.take ?? 5
    const requested_name = query.brand_name.trim()
    const parameters = new URLSearchParams({
      brands_tags: to_brand_tag(requested_name),
      page: String(query.page ?? 1),
      page_size: String(take),
      sort_by: 'popularity_key',
      fields: search_fields,
    })
    const body = await request_open_food_facts('/api/v2/search', parameters, false, signal)
    const search_page = normalize_search_page(body, take)
    const { products } = search_page
    if (products.length === 0) return null

    const requested_normalized = normalize_name(requested_name)
    const matching_name = products
      .flatMap((product) => product.product_brand_names)
      .map((name) => name.trim())
      .find((name) => normalize_name(name) === requested_normalized)

    return {
      brand_name: matching_name ?? requested_name,
      ...search_page,
    }
  },
}
