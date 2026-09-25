import type { ai_tool_activity } from '@ai/runtime.ai'
import type { Tool, ToolSchema } from '@voltagent/core'
import type { ZodType } from 'zod'

import { createTool, createToolkit } from '@voltagent/core'

import {
  dto_tool_product_lookup,
  schema_tool_product_lookup_provider_brand_result,
  schema_tool_product_lookup_provider_product_result,
  schema_tool_product_lookup_record,
} from '@tool/product-lookup/product-lookup.dto.tool'

import { service_brand } from '@module/main/brand/brand.service'
import { service_product_provider } from '@module/main/product-provider/product-provider.service'
import { service_product } from '@module/main/product/product.service'

const product_columns = [
  'product_id',
  'product_barcode',
  'product_type',
  'product_name',
  'brand_id',
  'brand_name',
  'product_images',
  'product_nova_group',
  'product_ecoscore',
  'product_nutriscore',
  'product_metadata',
] as const

function is_not_found(error: unknown) {
  const code = (error as { code?: string })?.code

  return code === 'not-found' || code === 'not-found-product'
}

function provider_issue(error: unknown): 'configuration' | 'temporarily_unavailable' | null {
  const code = (error as { code?: string })?.code
  if (code === 'open-food-facts-configuration') return 'configuration'
  if (code === 'open-food-facts-unavailable') return 'temporarily_unavailable'
  return null
}

function tool_signal(options?: { toolContext?: { abortSignal?: AbortSignal }; abortController?: AbortController }): AbortSignal | undefined {
  return options?.toolContext?.abortSignal ?? options?.abortController?.signal
}

export const tool_product_lookup_local_by_barcode = createTool({
  name: 'tool_product_lookup_local_by_barcode',
  description: 'Search the Zaatot local product database by an exact numeric barcode. Use this before Open Food Facts.',

  parameters: dto_tool_product_lookup.local_by_barcode,

  execute: async ({ barcode }) => {
    try {
      const result = await service_product.find({
        columns: [...product_columns],
        product_barcode: [barcode],
        take: 1,
      })

      return {
        found: result.data.length > 0,
        source: 'local_database',
        data: result.data,
      }
    } catch (error) {
      if (is_not_found(error)) {
        return {
          found: false,
          source: 'local_database',
          data: [],
        }
      }

      throw error
    }
  },
})

export const tool_product_lookup_local_by_name = createTool({
  name: 'tool_product_lookup_local_by_name',
  description: 'Search the Zaatot local product database using a full or partial product name.',

  parameters: dto_tool_product_lookup.local_by_name,

  execute: async ({ product_name }) => {
    try {
      const result = await service_product.find({
        columns: [...product_columns],
        product_name: [product_name],
        take: 5,
      })

      return {
        found: result.data.length > 0,
        source: 'local_database',
        data: result.data,
        total: result.rows,
        page: result.page,
        page_size: result.take,
      }
    } catch (error) {
      if (is_not_found(error)) {
        return {
          found: false,
          source: 'local_database',
          data: [],
          total: 0,
          page: 1,
          page_size: 5,
        }
      }

      throw error
    }
  },
})

export const tool_product_lookup_provider_by_barcode = createTool({
  name: 'tool_product_lookup_provider_by_barcode',
  description:
    'Fetch food product information from Open Food Facts using an exact numeric barcode. Use only when the local barcode lookup finds nothing.',

  parameters: dto_tool_product_lookup.provider_by_barcode,

  execute: async ({ barcode }, options) => {
    try {
      const product = await service_product_provider.fetch_by_barcode(barcode, tool_signal(options))

      return {
        found: product !== null,
        available: true,
        issue: null,
        source: 'open_food_facts',
        data: product,
      }
    } catch (error) {
      const issue = provider_issue(error)
      if (!issue) throw error
      return { found: false, available: false, issue, source: 'open_food_facts', data: null }
    }
  },
})

export const tool_product_lookup_brand_by_name = createTool({
  name: 'tool_product_lookup_brand_by_name',
  description: 'Search the Zaatot local brand database using a full or partial brand name.',

  parameters: dto_tool_product_lookup.brand_by_name,

  execute: async ({ brand_name }) => {
    try {
      const result = await service_brand.find({
        columns: ['brand_id', 'brand_name', 'created_at'],
        brand_name: [brand_name],
        take: 5,
      })

      return {
        found: result.data.length > 0,
        source: 'local_database',
        data: result.data,
      }
    } catch (error) {
      if (is_not_found(error)) {
        return {
          found: false,
          source: 'local_database',
          data: [],
        }
      }

      throw error
    }
  },
})

export const tool_product_lookup_provider_by_product_name = createTool({
  name: 'tool_product_lookup_provider_by_product_name',
  description:
    'Search Open Food Facts by a product name. Use only when a product-specific request cannot be resolved by the local product-name lookup.',

  parameters: dto_tool_product_lookup.provider_by_product_name,

  execute: async ({ product_name, page }, options) => {
    try {
      const result = await service_product_provider.search_by_product_name({ product_name, take: 5, page: page ?? 1 }, tool_signal(options))

      return {
        found: result.products.length > 0,
        available: true,
        issue: null,
        source: 'open_food_facts',
        data: result,
      }
    } catch (error) {
      const issue = provider_issue(error)
      if (!issue) throw error
      return { found: false, available: false, issue, source: 'open_food_facts', data: null }
    }
  },
})

export const tool_product_lookup_provider_by_brand_name = createTool({
  name: 'tool_product_lookup_provider_by_brand_name',
  description:
    'Search Open Food Facts using a structured brand filter. Use only when the local brand lookup finds nothing. Associated products are examples, not competing brand identities.',

  parameters: dto_tool_product_lookup.provider_by_brand_name,

  execute: async ({ brand_name, page }, options) => {
    try {
      const brand = await service_product_provider.search_by_brand_name({ brand_name, take: 5, page: page ?? 1 }, tool_signal(options))

      return {
        found: brand !== null,
        available: true,
        issue: null,
        source: 'open_food_facts',
        data: brand,
      }
    } catch (error) {
      const issue = provider_issue(error)
      if (!issue) throw error
      return { found: false, available: false, issue, source: 'open_food_facts', data: null }
    }
  },
})

export const toolkit_product_lookup = createToolkit({
  name: 'toolkit_product_lookup',
  description: 'Read-only product and brand lookup capabilities',
  tools: [
    tool_product_lookup_local_by_barcode,
    tool_product_lookup_local_by_name,
    tool_product_lookup_provider_by_barcode,
    tool_product_lookup_brand_by_name,
    tool_product_lookup_provider_by_product_name,
    tool_product_lookup_provider_by_brand_name,
  ],
})

export type product_lookup_runtime = {
  use_tool: <T>(call: () => Promise<T>, activity?: ai_tool_activity) => Promise<T>
  inspect_content: (text: string) => Promise<string>
}

function product_lookup_activity(tool_name: string, args: Record<string, unknown>): ai_tool_activity {
  const query = String(args.barcode ?? args.product_name ?? args.brand_name ?? '').trim()
  const detail = query ? `Searching for ${query}.` : undefined
  if (tool_name === 'tool_product_lookup_local_by_barcode' || tool_name === 'tool_product_lookup_local_by_name') {
    return { name: tool_name, title: 'Searching the local product catalog', detail }
  }
  if (tool_name === 'tool_product_lookup_brand_by_name') {
    return { name: tool_name, title: 'Searching the local brand catalog', detail }
  }
  if (tool_name === 'tool_product_lookup_provider_by_brand_name') {
    return { name: tool_name, title: 'Searching Open Food Facts by brand', detail }
  }
  if (tool_name === 'tool_product_lookup_provider_by_product_name') {
    return { name: tool_name, title: 'Searching Open Food Facts by product', detail }
  }
  return { name: tool_name, title: 'Looking up the barcode in Open Food Facts', detail }
}

// Per-call wrappers keep each workflow's budget separate while reusing the existing tools.
export const create_product_lookup_toolkit = (runtime: product_lookup_runtime) => {
  const wrap = <T extends ToolSchema>(tool: Tool<T>, inspection_schema?: ZodType) =>
    createTool({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      execute: async (args, options) =>
        runtime.use_tool(
          async () => {
            const output = await tool.execute!(args, options)
            if (inspection_schema && output && typeof output === 'object' && 'found' in output && output.found === true && 'data' in output) {
              const inspected = await runtime.inspect_content(JSON.stringify(output.data))
              return { ...output, data: inspection_schema.parse(JSON.parse(inspected)) }
            }
            return output
          },
          product_lookup_activity(tool.name, args as Record<string, unknown>),
        ),
    })

  return createToolkit({
    ...toolkit_product_lookup,
    tools: [
      wrap(tool_product_lookup_local_by_barcode),
      wrap(tool_product_lookup_local_by_name),
      wrap(tool_product_lookup_provider_by_barcode, schema_tool_product_lookup_record),
      wrap(tool_product_lookup_brand_by_name),
      wrap(tool_product_lookup_provider_by_product_name, schema_tool_product_lookup_provider_product_result),
      wrap(tool_product_lookup_provider_by_brand_name, schema_tool_product_lookup_provider_brand_result),
    ],
  })
}
