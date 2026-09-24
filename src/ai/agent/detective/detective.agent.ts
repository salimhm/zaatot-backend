import type { type_product_lookup_record, type_schema_agent_detective } from '@agent/detective/detective.schema.agent'
import type { product_lookup_runtime } from '@tool/product-lookup/product-lookup.tool'

import { Agent } from '@voltagent/core'

import { trusted_agent_generation_options } from '@ai/generation.ai'
import { ai_google, ai_google_default_model } from '@ai/provider.ai'
import { prompt_agent_detective } from '@agent/detective/detective.prompt.agent'
import { schema_agent_detective, schema_product_lookup_tool_result } from '@agent/detective/detective.schema.agent'
import { create_product_lookup_toolkit, toolkit_product_lookup } from '@tool/product-lookup/product-lookup.tool'

export const $agent_detective = new Agent({
  id: 'detective',
  name: 'Ztroop Detective',
  purpose: 'Resolve product and brand identities and retrieve factual catalog information',
  instructions: prompt_agent_detective,
  model: ai_google(process.env.AI_DETECTIVE_MODEL || ai_google_default_model),
  tools: [toolkit_product_lookup],
  memory: false,
})

function normalize_name(value: string | null): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function split_brand_names(value: string | null | undefined): string[] {
  return typeof value === 'string' ? value.split(/[,;|]/).map((name) => name.trim()) : []
}

function product_brand_candidates(product: type_product_lookup_record): string[] {
  const candidates = [product.brand_name, ...(product.product_brand_names ?? []), ...split_brand_names(product.product_brand_name)]
  const result: string[] = []
  const keys = new Set<string>()

  for (const candidate of candidates) {
    if (!candidate) continue
    const key = normalize_name(candidate)
    if (!key || keys.has(key)) continue
    keys.add(key)
    result.push(candidate.trim())
    if (result.length === 5) break
  }
  return result
}

function canonical_product_brand(product: type_product_lookup_record, candidates: string[]): string | null {
  if (candidates.length === 0) return null

  const product_name = normalize_name(product.product_name ?? null)
  const name_match = candidates.find((candidate) => {
    const brand = normalize_name(candidate)
    return brand !== '' && ` ${product_name} `.includes(` ${brand} `)
  })
  return name_match ?? candidates[0] ?? null
}

function normalize_product(
  product: type_product_lookup_record,
  source: type_schema_agent_detective['sources_checked'][number],
): type_schema_agent_detective['related_products']['items'][number] {
  const brand_candidates = product_brand_candidates(product)
  return {
    source,
    product_id: product.product_id ?? null,
    barcode: product.product_barcode ?? null,
    type: product.product_type ?? null,
    name: product.product_name ?? null,
    brand_name: canonical_product_brand(product, brand_candidates),
    brand_candidates,
    images: product.product_images ?? [],
    nova_group: product.product_nova_group ?? null,
    ecoscore: product.product_ecoscore ?? null,
    nutriscore: product.product_nutriscore ?? null,
    ingredients: product.product_metadata?.ingredients ?? null,
    allergens: product.product_metadata?.allergens ?? null,
  }
}

function product_key(product: type_schema_agent_detective['related_products']['items'][number]): string {
  return product.barcode ?? `${normalize_name(product.name)}|${normalize_name(product.brand_name)}|${product.source}`
}

export function normalize_detective_results(tool_results: unknown[] | undefined): type_schema_agent_detective {
  const sources_checked = new Set<type_schema_agent_detective['sources_checked'][number]>()
  const products: type_schema_agent_detective['related_products']['items'] = []
  const brands: Array<{ source: type_schema_agent_detective['sources_checked'][number]; brand_id: number | null; name: string }> = []
  const product_candidates: type_schema_agent_detective['related_products']['items'] = []
  const product_keys = new Set<string>()
  const product_candidate_keys = new Set<string>()
  const brand_keys = new Set<string>()
  let searched_products = false
  let searched_brands = false
  let unavailable_issue: 'configuration' | 'temporarily_unavailable' | null = null
  let product_relation: type_schema_agent_detective['related_products']['relation'] = 'none'
  let product_total = 0
  let product_page = 1
  let product_page_size = 0

  const append_product = (
    product: type_product_lookup_record,
    source: type_schema_agent_detective['sources_checked'][number],
    candidate: boolean,
  ) => {
    const normalized = normalize_product(product, source)
    const key = product_key(normalized)
    if (!product_keys.has(key)) {
      product_keys.add(key)
      products.push(normalized)
    }
    if (candidate && !product_candidate_keys.has(key)) {
      product_candidate_keys.add(key)
      product_candidates.push(normalized)
    }
  }

  const append_brand = (brand: (typeof brands)[number]) => {
    const key = normalize_name(brand.name)
    if (key === '' || brand_keys.has(key)) return
    brand_keys.add(key)
    brands.push(brand)
  }

  const set_product_page = (
    relation: Exclude<type_schema_agent_detective['related_products']['relation'], 'none'>,
    total: number,
    page: number,
    page_size: number,
  ) => {
    product_relation = relation
    product_total = Math.max(product_total, total)
    product_page = page
    product_page_size = page_size
  }

  for (const raw_result of tool_results ?? []) {
    if (!raw_result || typeof raw_result !== 'object' || !('toolName' in raw_result)) continue

    if (
      raw_result.toolName !== 'tool_product_lookup_local_by_barcode' &&
      raw_result.toolName !== 'tool_product_lookup_local_by_name' &&
      raw_result.toolName !== 'tool_product_lookup_provider_by_barcode' &&
      raw_result.toolName !== 'tool_product_lookup_brand_by_name' &&
      raw_result.toolName !== 'tool_product_lookup_provider_by_product_name' &&
      raw_result.toolName !== 'tool_product_lookup_provider_by_brand_name'
    ) {
      continue
    }

    const result = schema_product_lookup_tool_result.parse(raw_result)
    sources_checked.add(result.output.source)

    if (result.toolName === 'tool_product_lookup_brand_by_name') {
      searched_brands = true
      if (result.output.found !== result.output.data.length > 0) throw new Error('Inconsistent brand lookup tool result')
      for (const brand of result.output.data) {
        append_brand({ source: result.output.source, brand_id: brand.brand_id ?? null, name: brand.brand_name })
      }
      continue
    }

    if (result.toolName === 'tool_product_lookup_provider_by_brand_name') {
      searched_brands = true
      if (!result.output.available) {
        unavailable_issue = result.output.issue
        continue
      }
      const has_brand = result.output.data !== null && result.output.data.products.length > 0
      if (result.output.found !== has_brand) throw new Error('Inconsistent provider brand lookup tool result')
      if (result.output.data) {
        append_brand({ source: result.output.source, brand_id: null, name: result.output.data.brand_name })
        for (const product of result.output.data.products) append_product(product, result.output.source, false)
        set_product_page('brand_preview', result.output.data.total, result.output.data.page, result.output.data.page_size)
      }
      continue
    }

    searched_products = true
    if ('available' in result.output && !result.output.available) {
      unavailable_issue = result.output.issue
      continue
    }

    if (result.toolName === 'tool_product_lookup_provider_by_product_name') {
      const records = result.output.data?.products ?? []
      if (result.output.found !== records.length > 0) throw new Error('Inconsistent provider product lookup tool result')
      for (const product of records) append_product(product, result.output.source, true)
      if (result.output.data) {
        set_product_page('product_matches', result.output.data.total, result.output.data.page, result.output.data.page_size)
      }
      continue
    }

    const records = Array.isArray(result.output.data) ? result.output.data : result.output.data === null ? [] : [result.output.data]
    if (result.output.found !== records.length > 0) throw new Error('Inconsistent product lookup tool result')
    for (const product of records) append_product(product, result.output.source, true)
    if (records.length > 0) {
      const total = result.toolName === 'tool_product_lookup_local_by_name' ? (result.output.total ?? records.length) : records.length
      const page = result.toolName === 'tool_product_lookup_local_by_name' ? (result.output.page ?? 1) : 1
      const page_size = result.toolName === 'tool_product_lookup_local_by_name' ? (result.output.page_size ?? records.length) : records.length
      set_product_page('product_matches', total, page, page_size)
    }
  }

  const identified_brand = brands.length === 1 && product_candidates.length === 0 ? brands[0] : null
  const identified_product = product_candidates.length === 1 && product_total <= 1 && brands.length === 0 ? product_candidates[0] : null
  const status: type_schema_agent_detective['status'] =
    identified_brand || identified_product
      ? 'identified'
      : brands.length > 0 || product_candidates.length > 0
        ? 'requires_selection'
        : unavailable_issue
          ? 'unavailable'
          : 'not_found'
  const subject: type_schema_agent_detective['subject'] = identified_brand
    ? { type: 'brand', source: identified_brand.source, name: identified_brand.name, brand_id: identified_brand.brand_id }
    : identified_product
      ? {
          type: 'product',
          source: identified_product.source,
          name: identified_product.name,
          barcode: identified_product.barcode,
          brand_name: identified_product.brand_name,
          brand_candidates: identified_product.brand_candidates,
        }
      : null
  const query_type: type_schema_agent_detective['query_type'] = subject
    ? subject.type
    : searched_products && searched_brands
      ? 'mixed'
      : searched_products
        ? 'product'
        : searched_brands
          ? 'brand'
          : 'unknown'
  const selection_options: type_schema_agent_detective['selection']['options'] =
    status === 'requires_selection'
      ? [
          ...brands.map((brand) => ({ type: 'brand' as const, source: brand.source, name: brand.name, brand_id: brand.brand_id })),
          ...product_candidates.map((product) => ({
            type: 'product' as const,
            source: product.source,
            name: product.name,
            barcode: product.barcode,
            brand_name: product.brand_name,
            brand_candidates: product.brand_candidates,
          })),
        ]
      : []
  const selection_total =
    status !== 'requires_selection'
      ? 0
      : brands.length > 0 && product_candidates.length > 0
        ? brands.length + Math.max(product_total, product_candidates.length)
        : brands.length > 0
          ? brands.length
          : Math.max(product_total, product_candidates.length)
  const effective_page_size = products.length > 0 ? Math.max(product_page_size, products.length) : 0
  const related_products: type_schema_agent_detective['related_products'] = {
    relation: products.length > 0 ? product_relation : 'none',
    items: products,
    total: Math.max(product_total, products.length),
    page: product_page,
    page_size: effective_page_size,
    has_more: effective_page_size > 0 && product_page * effective_page_size < Math.max(product_total, products.length),
  }
  const message =
    status === 'identified'
      ? subject?.type === 'brand'
        ? `Identified the ${subject.name} brand.`
        : `Identified ${subject?.name ?? 'the requested product'}.`
      : status === 'requires_selection'
        ? 'Multiple possible matches were found. Select a brand or a specific product.'
        : status === 'unavailable'
          ? unavailable_issue === 'configuration'
            ? 'Open Food Facts is not configured for this environment.'
            : 'Open Food Facts is temporarily unavailable. Try again later.'
          : sources_checked.size > 0
            ? 'No matching product or brand information was found in the checked sources.'
            : 'No product or brand lookup was performed.'

  return schema_agent_detective.parse({
    status,
    query_type,
    found: status === 'identified',
    subject,
    selection: {
      required: status === 'requires_selection',
      options: selection_options,
      total_options: selection_total,
    },
    related_products,
    sources_checked: [...sources_checked],
    message,
  })
}

export const agent_detective = async (
  message: string,
  signal?: AbortSignal,
  runtime?: product_lookup_runtime,
): Promise<{ success: true; data: type_schema_agent_detective } | { success: false; data: unknown }> => {
  try {
    signal?.throwIfAborted()
    let tool_error: Error | undefined
    const result = await $agent_detective.generateText(message, {
      ...trusted_agent_generation_options,
      temperature: 0,
      maxSteps: 6,
      maxRetries: 0,
      abortSignal: signal,
      tools: runtime ? [create_product_lookup_toolkit(runtime)] : undefined,
      hooks: {
        onToolError: async ({ originalError }) => {
          tool_error = originalError
        },
      },
    })

    signal?.throwIfAborted()
    if (tool_error) throw tool_error
    return { success: true, data: normalize_detective_results(result.toolResults) }
  } catch (error) {
    return { success: false, data: error }
  }
}
