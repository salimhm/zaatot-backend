import type {
  type_parsed_input_agent_bargain_hunter,
  type_schema_agent_bargain_hunter,
  type_schema_input_agent_bargain_hunter,
} from '@agent/bargain-hunter/bargain-hunter.schema.agent'
import type { alternative_lookup_runtime } from '@tool/alternative-lookup/alternative-lookup.tool'
import type { product_lookup_runtime } from '@tool/product-lookup/product-lookup.tool'
import type { Toolkit } from '@voltagent/core'

import { Agent, Tool } from '@voltagent/core'
import { z } from 'zod'

import { trusted_agent_generation_options } from '@ai/generation.ai'
import { ai_cloudflare, ai_cloudflare_default_model } from '@ai/provider.ai'
import { prompt_agent_bargain_hunter } from '@agent/bargain-hunter/bargain-hunter.prompt.agent'
import { schema_agent_bargain_hunter, schema_input_agent_bargain_hunter } from '@agent/bargain-hunter/bargain-hunter.schema.agent'
import { schema_tool_alternative_lookup_boycat_result } from '@tool/alternative-lookup/alternative-lookup.dto.tool'
import { create_alternative_lookup_toolkit, toolkit_alternative_lookup } from '@tool/alternative-lookup/alternative-lookup.tool'
import { schema_tool_product_lookup_provider_brand_result } from '@tool/product-lookup/product-lookup.dto.tool'
import {
  create_product_lookup_toolkit,
  tool_product_lookup_provider_by_brand_name,
  toolkit_product_lookup,
} from '@tool/product-lookup/product-lookup.tool'

export type bargain_hunter_runtime = alternative_lookup_runtime & product_lookup_runtime

const boycat_tool_name = 'tool_alternative_lookup_boycat_by_brand'
const provider_brand_tool_name = 'tool_product_lookup_provider_by_brand_name'

const schema_boycat_tool_result = z.object({
  toolName: z.literal(boycat_tool_name),
  input: z.object({ brand_name: z.string() }),
  output: schema_tool_alternative_lookup_boycat_result,
})

const schema_provider_brand_tool_result = z.object({
  toolName: z.literal(provider_brand_tool_name),
  input: z.object({ brand_name: z.string(), page: z.number().int().positive().optional() }),
  output: z.object({
    found: z.boolean(),
    available: z.boolean(),
    issue: z.enum(['configuration', 'temporarily_unavailable']).nullable(),
    source: z.literal('open_food_facts'),
    data: schema_tool_product_lookup_provider_brand_result.nullable(),
  }),
})

export const $agent_bargain_hunter = new Agent({
  id: 'bargain-hunter',
  name: 'Bargain Hunter',
  purpose: 'Retrieve externally sourced alternative brands and resolve them to factual product examples without recommending them',
  instructions: prompt_agent_bargain_hunter,
  model: ai_cloudflare(process.env.CF_BARGAIN_HUNTER_MODEL || ai_cloudflare_default_model),
  tools: [toolkit_alternative_lookup, tool_product_lookup_provider_by_brand_name],
  memory: false,
})

const normalize_name = (value: string | null | undefined) =>
  (value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')

const unique_strings = (values: readonly string[]) => [...new Set(values.filter(Boolean))]

const subject_brand = (input: type_parsed_input_agent_bargain_hunter) => (input.subject.type === 'brand' ? input.subject.name : input.subject.brand)

const candidate_key = (value: string) => normalize_name(value)

const candidate_id = (name: string, index: number) => {
  const slug = normalize_name(name).replace(/\s+/g, '-').slice(0, 150)
  return `boycat:${slug || index + 1}`
}

const product_brand_names = (product: z.infer<typeof schema_tool_product_lookup_provider_brand_result>['products'][number]) => {
  const names = [product.brand_name, ...(product.product_brand_names ?? [])]
  if (product.product_brand_name) names.push(...product.product_brand_name.split(/[,;|]/))
  return unique_strings(names.map((name) => name?.trim() ?? ''))
}

const product_key = (product: z.infer<typeof schema_tool_product_lookup_provider_brand_result>['products'][number]) =>
  product.product_barcode ?? `${normalize_name(product.product_name)}|${normalize_name(product.product_brand_name)}`

const matches_original_product = (
  input: type_parsed_input_agent_bargain_hunter,
  product: z.infer<typeof schema_tool_product_lookup_provider_brand_result>['products'][number],
) => {
  if (input.subject.barcode && product.product_barcode === input.subject.barcode) return true
  if (input.subject.type !== 'product') return false
  return (
    normalize_name(product.product_name) === normalize_name(input.subject.name) &&
    product_brand_names(product).some((brand) => normalize_name(brand) === normalize_name(input.subject.brand))
  )
}

const parse_boycat_result = (results: unknown[]) => {
  for (const result of results) {
    const parsed = schema_boycat_tool_result.safeParse(result)
    if (parsed.success) return parsed.data
  }
  return null
}

const parse_provider_results = (results: unknown[]) =>
  results.flatMap((result) => {
    const parsed = schema_provider_brand_tool_result.safeParse(result)
    return parsed.success ? [parsed.data] : []
  })

const unsupported_dimension_limitations = (input: type_parsed_input_agent_bargain_hunter) =>
  input.requested_dimensions
    .filter((dimension) => dimension !== 'boycott')
    .map((dimension) => `${dimension[0]?.toUpperCase()}${dimension.slice(1)}-based alternative discovery is not implemented in Bargain Hunter v1.`)

export const normalize_bargain_hunter_results = (
  raw_input: type_schema_input_agent_bargain_hunter,
  tool_results: unknown[] | undefined,
): type_schema_agent_bargain_hunter => {
  const input = schema_input_agent_bargain_hunter.parse(raw_input)
  const results = tool_results ?? []
  const brand = subject_brand(input)
  const common_limitations = unique_strings([
    ...unsupported_dimension_limitations(input),
    ...input.constraints.map((constraint) => constraint.message),
  ]).slice(0, 27)

  if (!input.requested_dimensions.includes('boycott')) {
    return schema_agent_bargain_hunter.parse({
      schema_version: 1,
      status: 'insufficient_data',
      subject: input.subject,
      requested_dimensions: input.requested_dimensions,
      candidates: [],
      limitations: common_limitations,
      message: 'Bargain Hunter v1 currently has no candidate source for the requested alternative dimensions.',
    })
  }

  if (!brand) {
    return schema_agent_bargain_hunter.parse({
      schema_version: 1,
      status: 'insufficient_data',
      subject: input.subject,
      requested_dimensions: input.requested_dimensions,
      candidates: [],
      limitations: [...common_limitations, 'A resolved brand is required before Boycat can provide alternative candidates.'].slice(0, 30),
      message: 'No resolved brand was available for alternative lookup.',
    })
  }

  const boycat = parse_boycat_result(results)
  if (!boycat) {
    return schema_agent_bargain_hunter.parse({
      schema_version: 1,
      status: 'insufficient_data',
      subject: input.subject,
      requested_dimensions: input.requested_dimensions,
      candidates: [],
      limitations: [...common_limitations, 'Boycat alternative lookup did not complete.'].slice(0, 30),
      message: 'The alternative source was not checked.',
    })
  }

  if (boycat.output.provider_status === 'unavailable' || boycat.output.provider_status === 'invalid_response') {
    return schema_agent_bargain_hunter.parse({
      schema_version: 1,
      status: 'unavailable',
      subject: input.subject,
      requested_dimensions: input.requested_dimensions,
      candidates: [],
      limitations: [...common_limitations, boycat.output.reason].slice(0, 30),
      message: 'Boycat could not provide alternative candidates at this time.',
    })
  }

  if (boycat.output.provider_status === 'ambiguous') {
    return schema_agent_bargain_hunter.parse({
      schema_version: 1,
      status: 'insufficient_data',
      subject: input.subject,
      requested_dimensions: input.requested_dimensions,
      candidates: [],
      limitations: [...common_limitations, boycat.output.reason].slice(0, 30),
      message: 'Boycat could not verify one brand identity for alternative lookup.',
    })
  }

  const subject_key = normalize_name(brand)
  const seen_candidates = new Set<string>()
  const seeds = boycat.output.alternatives
    .filter((alternative) => {
      const key = candidate_key(alternative.name)
      if (!key || key === subject_key || seen_candidates.has(key)) return false
      seen_candidates.add(key)
      return true
    })
    .slice(0, input.max_candidates)

  if (seeds.length === 0) {
    return schema_agent_bargain_hunter.parse({
      schema_version: 1,
      status: 'none_found',
      subject: input.subject,
      requested_dimensions: input.requested_dimensions,
      candidates: [],
      limitations: common_limitations,
      message: 'Boycat did not return a distinct alternative brand for the resolved subject.',
    })
  }

  const provider_results = parse_provider_results(results)
  const retrieved_at = new Date().toISOString()
  const resolution_limitations: string[] = []
  const candidates = seeds.map((seed, index) => {
    const key = candidate_key(seed.name)
    const lookup = provider_results.find((result) => candidate_key(result.input.brand_name) === key)
    const exact_products = lookup?.output.data?.products.filter((product) => {
      if (matches_original_product(input, product)) return false
      return product_brand_names(product).some((product_brand) => normalize_name(product_brand) === key)
    })
    const products = [...new Map((exact_products ?? []).map((product) => [product_key(product), product])).values()]
      .filter((product) => Boolean(product.product_barcode || product.product_name?.trim()))
      .slice(0, 3)
      .map((product, product_index) => ({
        source: 'open_food_facts' as const,
        source_id: `open-food-facts:${product.product_barcode ?? `${candidate_id(seed.name, index)}:${product_index + 1}`}`,
        barcode: product.product_barcode ?? null,
        name: product.product_name?.trim() || null,
        brand_name: product_brand_names(product)[0] ?? seed.name,
        image_url: product.product_images?.[0]?.trim() || null,
        nova_group: product.product_nova_group ?? null,
        ecoscore: product.product_ecoscore ?? null,
        nutriscore: product.product_nutriscore ?? null,
        packaging: product.product_packaging ?? null,
        retrieved_at,
      }))
    const resolution_status = lookup && !lookup.output.available ? 'unavailable' : products.length > 0 ? 'resolved' : 'brand_only'
    if (resolution_status === 'unavailable') resolution_limitations.push(`Open Food Facts was unavailable while resolving ${seed.name}.`)
    if (resolution_status === 'brand_only') resolution_limitations.push(`No exact Open Food Facts product was resolved for ${seed.name}.`)

    return {
      candidate_id: candidate_id(seed.name, index),
      entity_type: 'brand' as const,
      name: seed.name,
      image_url: seed.image_url,
      description: seed.description,
      source: 'boycat' as const,
      source_id: `boycat-alternative:${candidate_id(seed.name, index)}`,
      products,
      resolution_status,
      validation_status: 'pending_review' as const,
      reasons: [
        'Boycat suggested this brand as an alternative.',
        ...(products.length > 0 ? [`Open Food Facts resolved ${products.length} matching product${products.length === 1 ? '' : 's'}.`] : []),
      ],
    }
  })

  return schema_agent_bargain_hunter.parse({
    schema_version: 1,
    status: 'candidates_found',
    subject: input.subject,
    requested_dimensions: input.requested_dimensions,
    candidates,
    limitations: unique_strings([
      ...common_limitations,
      ...resolution_limitations,
      'Boycat suggestions and Open Food Facts matches are unreviewed candidates, not recommendations.',
      'No price comparison was performed because no pricing provider is connected.',
    ]).slice(0, 30),
    message: `Boycat returned ${candidates.length} alternative brand candidate${candidates.length === 1 ? '' : 's'}; each remains pending review.`,
  })
}

const find_tool = (toolkit: Toolkit, name: string) => toolkit.tools.find((item): item is Tool => item instanceof Tool && item.name === name)

const has_tool_call = (results: unknown[], name: string, argument_name: string, argument_value: string) =>
  results.some(
    (result) =>
      typeof result === 'object' &&
      result !== null &&
      'toolName' in result &&
      result.toolName === name &&
      'input' in result &&
      normalize_name(String((result.input as Record<string, unknown> | null)?.[argument_name] ?? '')) === normalize_name(argument_value),
  )

const execute_tool = async (tool: Tool, input: Record<string, unknown>, signal?: AbortSignal) => {
  if (!tool.execute) throw new Error(`Tool ${tool.name} cannot be executed.`)
  signal?.throwIfAborted()
  const output = await tool.execute(input, { toolContext: { abortSignal: signal } } as never)
  signal?.throwIfAborted()
  return { toolName: tool.name, input, output }
}

const complete_alternative_lookups = async (
  input: type_parsed_input_agent_bargain_hunter,
  initial_results: unknown[],
  alternative_toolkit: Toolkit,
  product_toolkit: Toolkit,
  signal?: AbortSignal,
) => {
  const results = [...initial_results]
  if (!input.requested_dimensions.includes('boycott')) return results
  const brand = subject_brand(input)
  if (!brand) return results

  const boycat_tool = find_tool(alternative_toolkit, boycat_tool_name)
  if (!has_tool_call(results, boycat_tool_name, 'brand_name', brand)) {
    if (!boycat_tool) throw new Error('Boycat alternative tool is unavailable.')
    results.push(await execute_tool(boycat_tool, { brand_name: brand }, signal))
  }

  const boycat = parse_boycat_result(results)
  if (!boycat || boycat.output.provider_status !== 'matched') return results
  const provider_tool = find_tool(product_toolkit, provider_brand_tool_name)
  if (!provider_tool) throw new Error('Open Food Facts brand lookup tool is unavailable.')

  const subject_key = normalize_name(brand)
  const names = [...new Map(boycat.output.alternatives.map((alternative) => [candidate_key(alternative.name), alternative.name])).entries()]
    .filter(([key]) => key && key !== subject_key)
    .slice(0, input.max_candidates)
    .map(([, name]) => name)

  for (const name of names) {
    if (has_tool_call(results, provider_brand_tool_name, 'brand_name', name)) continue
    results.push(await execute_tool(provider_tool, { brand_name: name, page: 1 }, signal))
  }
  return results
}

const product_toolkit_for = (runtime?: bargain_hunter_runtime) => (runtime ? create_product_lookup_toolkit(runtime) : toolkit_product_lookup)

export const agent_bargain_hunter = async (
  raw_input: type_schema_input_agent_bargain_hunter,
  signal?: AbortSignal,
  runtime?: bargain_hunter_runtime,
): Promise<{ success: true; data: type_schema_agent_bargain_hunter } | { success: false; data: unknown }> => {
  try {
    signal?.throwIfAborted()
    const input = schema_input_agent_bargain_hunter.parse(raw_input)
    const alternative_toolkit = runtime ? create_alternative_lookup_toolkit(runtime) : toolkit_alternative_lookup
    const product_toolkit = product_toolkit_for(runtime)
    const provider_tool = find_tool(product_toolkit, provider_brand_tool_name)
    if (!provider_tool) throw new Error('Open Food Facts brand lookup tool is unavailable.')
    let tool_error: Error | undefined
    let tool_results: unknown[] = []

    try {
      const result = await $agent_bargain_hunter.generateText(JSON.stringify(input), {
        ...trusted_agent_generation_options,
        temperature: 0,
        maxSteps: 6,
        maxRetries: 0,
        abortSignal: signal,
        tools: [alternative_toolkit, provider_tool],
        hooks: {
          onToolError: async ({ originalError }) => {
            tool_error = originalError
          },
        },
      })
      tool_results = result.toolResults ?? []
    } catch (error) {
      signal?.throwIfAborted()
      // The request is already structured, so deterministic tool execution can
      // still complete when the model provider is temporarily unavailable.
      if (tool_error) throw tool_error
      if (!(error instanceof Error)) throw error
    }

    signal?.throwIfAborted()
    if (tool_error) throw tool_error
    const completed_results = await complete_alternative_lookups(input, tool_results, alternative_toolkit, product_toolkit, signal)
    signal?.throwIfAborted()
    return { success: true, data: normalize_bargain_hunter_results(input, completed_results) }
  } catch (error) {
    return { success: false, data: error }
  }
}
