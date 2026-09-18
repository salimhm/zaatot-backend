import type {
  type_product_lookup_record,
  type_schema_agent_product_brand_lookup,
} from '@agent/product-brand-lookup/product-brand-lookup.schema.agent'

import { groq } from '@ai-sdk/groq'
import { Agent } from '@voltagent/core'

import { prompt_agent_product_brand_lookup } from '@agent/product-brand-lookup/product-brand-lookup.prompt.agent'
import { schema_agent_product_brand_lookup, schema_product_lookup_tool_result } from '@agent/product-brand-lookup/product-brand-lookup.schema.agent'
import { toolkit_product_lookup } from '@tool/product-lookup/product-lookup.tool'

export const $agent_product_brand_lookup = new Agent({
  id: 'product-brand-lookup',
  name: 'Ztroop Product and Brand Lookup',
  purpose: 'Retrieve factual product and brand information',
  instructions: prompt_agent_product_brand_lookup,
  model: groq(process.env.GROQ_DEFAULT_AI_MODEL_NAME || 'openai/gpt-oss-20b'),
  tools: [toolkit_product_lookup],
  memory: false,
})

function normalize_product(
  product: type_product_lookup_record,
  source: type_schema_agent_product_brand_lookup['sources_checked'][number],
): type_schema_agent_product_brand_lookup['products'][number] {
  return {
    source,
    product_id: product.product_id ?? null,
    barcode: product.product_barcode ?? null,
    type: product.product_type ?? null,
    name: product.product_name ?? null,
    brand_name: product.brand_name ?? product.product_brand_name ?? null,
    images: product.product_images ?? [],
    nova_group: product.product_nova_group ?? null,
    ecoscore: product.product_ecoscore ?? null,
    nutriscore: product.product_nutriscore ?? null,
    ingredients: product.product_metadata?.ingredients ?? null,
    allergens: product.product_metadata?.allergens ?? null,
  }
}

export function normalize_product_brand_lookup_results(tool_results: unknown[] | undefined): type_schema_agent_product_brand_lookup {
  const sources_checked = new Set<type_schema_agent_product_brand_lookup['sources_checked'][number]>()
  const products: type_schema_agent_product_brand_lookup['products'] = []
  const brands: type_schema_agent_product_brand_lookup['brands'] = []
  let searched_products = false
  let searched_brands = false

  for (const raw_result of tool_results ?? []) {
    if (!raw_result || typeof raw_result !== 'object' || !('toolName' in raw_result)) {
      continue
    }

    if (
      raw_result.toolName !== 'tool_product_lookup_local_by_barcode' &&
      raw_result.toolName !== 'tool_product_lookup_local_by_name' &&
      raw_result.toolName !== 'tool_product_lookup_provider_by_barcode' &&
      raw_result.toolName !== 'tool_product_lookup_brand_by_name'
    ) {
      continue
    }

    const result = schema_product_lookup_tool_result.parse(raw_result)
    sources_checked.add(result.output.source)

    if (result.toolName === 'tool_product_lookup_brand_by_name') {
      searched_brands = true
      if (result.output.found !== result.output.data.length > 0) {
        throw new Error('Inconsistent brand lookup tool result')
      }
      brands.push(
        ...result.output.data.map((brand) => ({
          source: result.output.source,
          brand_id: brand.brand_id ?? null,
          name: brand.brand_name,
        })),
      )
    } else {
      searched_products = true
      const records = Array.isArray(result.output.data) ? result.output.data : result.output.data === null ? [] : [result.output.data]

      if (result.output.found !== records.length > 0) {
        throw new Error('Inconsistent product lookup tool result')
      }
      products.push(...records.map((product) => normalize_product(product, result.output.source)))
    }
  }

  const query_type = searched_products && searched_brands ? 'mixed' : searched_products ? 'product' : searched_brands ? 'brand' : 'unknown'
  const found = products.length > 0 || brands.length > 0
  const matches = [
    products.length > 0 ? `${products.length} product${products.length === 1 ? '' : 's'}` : null,
    brands.length > 0 ? `${brands.length} brand${brands.length === 1 ? '' : 's'}` : null,
  ].filter((match): match is string => match !== null)
  const message = found
    ? `Found ${matches.join(' and ')}.`
    : sources_checked.size > 0
      ? 'No matching product or brand information was found in the checked sources.'
      : 'No product or brand lookup was performed.'

  return schema_agent_product_brand_lookup.parse({
    query_type,
    found,
    sources_checked: [...sources_checked],
    products,
    brands,
    message,
  })
}

export const agent_product_brand_lookup = async (
  message: string,
): Promise<{ success: true; data: type_schema_agent_product_brand_lookup } | { success: false; data: unknown }> => {
  try {
    const result = await $agent_product_brand_lookup.generateText(message, {
      temperature: 0,
      maxSteps: 4,
    })

    const data = normalize_product_brand_lookup_results(result.toolResults)

    return {
      success: true,
      data,
    }
  } catch (error) {
    return {
      success: false,
      data: error,
    }
  }
}
