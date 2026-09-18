import type { Tool, ToolSchema } from '@voltagent/core'

import { createTool, createToolkit } from '@voltagent/core'

import { service_brand } from '@module/main/brand/brand.service'
import { service_product_provider } from '@module/main/product-provider/product-provider.service'
import { service_product } from '@module/main/product/product.service'

import { dto_tool_product_lookup } from './product-lookup.dto.tool'

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

export const tool_product_lookup_provider_by_barcode = createTool({
  name: 'tool_product_lookup_provider_by_barcode',
  description:
    'Fetch food product information from Open Food Facts using an exact numeric barcode. Use only when the local barcode lookup finds nothing.',

  parameters: dto_tool_product_lookup.provider_by_barcode,

  execute: async ({ barcode }) => {
    const product = await service_product_provider.fetch_by_barcode(barcode)

    return {
      found: product !== null,
      source: 'open_food_facts',
      data: product,
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

export const toolkit_product_lookup = createToolkit({
  name: 'toolkit_product_lookup',
  description: 'Read-only product and brand lookup capabilities',
  tools: [
    tool_product_lookup_local_by_barcode,
    tool_product_lookup_local_by_name,
    tool_product_lookup_provider_by_barcode,
    tool_product_lookup_brand_by_name,
  ],
})

export type product_lookup_runtime = {
  use_tool: <T>(call: () => Promise<T>) => Promise<T>
  inspect_content: (text: string) => Promise<string>
}

// Per-call wrappers keep each workflow's budget separate while reusing the existing tools.
export const create_product_lookup_toolkit = (runtime: product_lookup_runtime) => {
  const wrap = <T extends ToolSchema>(tool: Tool<T>, inspect_external = false) =>
    createTool({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      execute: async (args, options) =>
        runtime.use_tool(async () => {
          const output = await tool.execute!(args, options)
          if (inspect_external && output && typeof output === 'object' && 'found' in output && output.found === true && 'data' in output) {
            return { ...output, data: await runtime.inspect_content(JSON.stringify(output.data)) }
          }
          return output
        }),
    })

  return createToolkit({
    ...toolkit_product_lookup,
    tools: [
      wrap(tool_product_lookup_local_by_barcode),
      wrap(tool_product_lookup_local_by_name),
      wrap(tool_product_lookup_provider_by_barcode, true),
      wrap(tool_product_lookup_brand_by_name),
    ],
  })
}
