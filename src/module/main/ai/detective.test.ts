import type { ai_tool_activity } from '@ai/runtime.ai'
import type { product_lookup_runtime } from '@tool/product-lookup/product-lookup.tool'
import type { Toolkit } from '@voltagent/core'

import { Tool } from '@voltagent/core'
import { describe, expect, it, mock, spyOn } from 'bun:test'

import { $agent_detective, agent_detective } from '@agent/detective/detective.agent'
import { create_product_lookup_toolkit, toolkit_product_lookup } from '@tool/product-lookup/product-lookup.tool'

import { service_product_provider } from '@module/main/product-provider/product-provider.service'
import { service_product } from '@module/main/product/product.service'

function lookup_tool(toolkit: Toolkit, index: number) {
  const tool = toolkit.tools[index]
  if (!(tool instanceof Tool)) throw new Error('Expected a VoltAgent lookup tool')
  return tool
}

describe('Detective workflow integration', () => {
  it('builds structured output from tool results and rejects inconsistent results', async () => {
    const generate = spyOn($agent_detective, 'generateText')
    const signal = new AbortController().signal
    try {
      generate.mockResolvedValue({
        text: 'Unverified model text',
        toolResults: [
          {
            toolName: 'tool_product_lookup_brand_by_name',
            output: { found: true, source: 'local_database', data: [{ brand_id: 7, brand_name: 'Example' }] },
          },
        ],
      } as Awaited<ReturnType<typeof $agent_detective.generateText>>)
      expect(await agent_detective('Find this brand', signal)).toEqual({
        success: true,
        data: {
          status: 'identified',
          query_type: 'brand',
          found: true,
          subject: { type: 'brand', source: 'local_database', brand_id: 7, name: 'Example' },
          selection: { required: false, options: [], total_options: 0 },
          related_products: { relation: 'none', items: [], total: 0, page: 1, page_size: 0, has_more: false },
          sources_checked: ['local_database'],
          message: 'Identified the Example brand.',
        },
      })
      expect(generate.mock.calls[0]![1]?.output).toBeUndefined()
      expect(generate.mock.calls[0]![1]?.abortSignal).toBe(signal)
      expect(generate.mock.calls[0]![1]?.maxRetries).toBe(0)

      generate.mockResolvedValue({
        toolResults: [{ toolName: 'tool_product_lookup_brand_by_name', output: { found: true, source: 'local_database', data: [] } }],
      } as Awaited<ReturnType<typeof $agent_detective.generateText>>)
      expect((await agent_detective('Find this brand', signal)).success).toBe(false)
    } finally {
      generate.mockRestore()
    }
  })

  it('does not start a cancelled lookup and discards a result arriving after cancellation', async () => {
    const controller = new AbortController()
    const generate = spyOn($agent_detective, 'generateText')
    try {
      controller.abort()
      expect((await agent_detective('Find this brand', controller.signal)).success).toBe(false)
      expect(generate).not.toHaveBeenCalled()

      const late = new AbortController()
      generate.mockImplementation(async () => {
        late.abort()
        return { toolResults: [] } as unknown as Awaited<ReturnType<typeof $agent_detective.generateText>>
      })
      expect((await agent_detective('Find this brand', late.signal)).success).toBe(false)
    } finally {
      generate.mockRestore()
    }
  })

  it('does not accept a successful-looking answer after a tool failure', async () => {
    const error = new Error('Lookup failed')
    const generate = spyOn($agent_detective, 'generateText').mockImplementation(async (_message, options) => {
      const on_error = options!.hooks!.onToolError!
      await on_error({ originalError: error } as Parameters<typeof on_error>[0])
      return { toolResults: [] } as unknown as Awaited<ReturnType<typeof $agent_detective.generateText>>
    })
    try {
      expect(await agent_detective('Find this product')).toEqual({ success: false, data: error })
    } finally {
      generate.mockRestore()
    }
  })

  it('charges each tool call to its request budget without changing the shared toolkit', async () => {
    const find = spyOn(service_product, 'find').mockResolvedValue({ data: [], page: 1, take: 5, rows: 0, pages: 0 })
    let calls = 0
    const activities: Array<ai_tool_activity | undefined> = []
    const runtime: product_lookup_runtime = {
      use_tool: async (call, activity) => {
        if (calls >= 1) throw new Error('Budget exhausted')
        calls++
        activities.push(activity)
        return await call()
      },
      inspect_content: mock(async (text) => text),
    }
    const toolkit = create_product_lookup_toolkit(runtime)
    try {
      expect(toolkit.tools).toHaveLength(toolkit_product_lookup.tools.length)
      expect(toolkit.tools[0]).not.toBe(toolkit_product_lookup.tools[0])
      const barcode = lookup_tool(toolkit, 0)
      const name = lookup_tool(toolkit, 1)
      expect(await barcode.execute!({ barcode: '1234567890' })).toEqual({ found: false, source: 'local_database', data: [] })
      expect(activities[0]).toEqual({
        name: 'tool_product_lookup_local_by_barcode',
        title: 'Searching the local product catalog',
        detail: 'Searching for 1234567890.',
      })
      await expect(name.execute!({ product_name: 'Cereal' }) as Promise<unknown>).rejects.toThrow('Budget exhausted')
      expect(find).toHaveBeenCalledTimes(1)
      expect(runtime.inspect_content).not.toHaveBeenCalled()

      const another = create_product_lookup_toolkit({ ...runtime, use_tool: async (call) => await call() })
      await lookup_tool(another, 1).execute!({ product_name: 'Cereal' })
      expect(find).toHaveBeenCalledTimes(2)
    } finally {
      find.mockRestore()
    }
  })

  it('inspects external provider content before returning it and propagates inspection failures', async () => {
    const provider = spyOn(service_product_provider, 'fetch_by_barcode').mockResolvedValue({ product_name: 'Untrusted name' } as Awaited<
      ReturnType<typeof service_product_provider.fetch_by_barcode>
    >)
    const inspect = mock(async (text: string) => text)
    const toolkit = create_product_lookup_toolkit({ use_tool: async (call) => await call(), inspect_content: inspect })
    const lookup = lookup_tool(toolkit, 2)
    try {
      expect(await lookup.execute!({ barcode: '1234567890' })).toEqual({
        found: true,
        available: true,
        issue: null,
        source: 'open_food_facts',
        data: { product_name: 'Untrusted name' },
      })
      expect(inspect).toHaveBeenCalledWith(JSON.stringify({ product_name: 'Untrusted name' }))

      inspect.mockResolvedValue('Inspected product facts')
      await expect(lookup.execute!({ barcode: '1234567890' }) as Promise<unknown>).rejects.toThrow()

      inspect.mockRejectedValue(new Error('Bait Tester is not implemented'))
      await expect(lookup.execute!({ barcode: '1234567890' }) as Promise<unknown>).rejects.toThrow('Bait Tester is not implemented')

      provider.mockResolvedValue(null)
      expect(await lookup.execute!({ barcode: '1234567890' })).toEqual({
        found: false,
        available: true,
        issue: null,
        source: 'open_food_facts',
        data: null,
      })
      expect(inspect).toHaveBeenCalledTimes(3)
    } finally {
      provider.mockRestore()
    }
  })

  it('inspects and validates external product-name and brand-name search results', async () => {
    const products = [
      { product_barcode: '5449000054227', product_name: 'Coca-Cola Original Taste', product_brand_name: 'Coca-Cola' },
      { product_barcode: '5449000131805', product_name: 'Coca-Cola Zero Sugar', product_brand_name: 'Coca-Cola' },
    ]
    const search_products = spyOn(service_product_provider, 'search_by_product_name').mockResolvedValue({
      products,
      total: 2238,
      page: 1,
      page_size: 5,
    } as Awaited<ReturnType<typeof service_product_provider.search_by_product_name>>)
    const search_brand = spyOn(service_product_provider, 'search_by_brand_name').mockResolvedValue({
      brand_name: 'Coca-Cola',
      products,
      total: 2238,
      page: 1,
      page_size: 5,
    } as Awaited<ReturnType<typeof service_product_provider.search_by_brand_name>>)
    const inspect = mock(async (text: string) => text)
    const toolkit = create_product_lookup_toolkit({ use_tool: async (call) => await call(), inspect_content: inspect })

    try {
      expect(await lookup_tool(toolkit, 4).execute!({ product_name: 'Coca Cola' })).toEqual({
        found: true,
        available: true,
        issue: null,
        source: 'open_food_facts',
        data: { products, total: 2238, page: 1, page_size: 5 },
      })
      expect(await lookup_tool(toolkit, 5).execute!({ brand_name: 'Coca Cola' })).toEqual({
        found: true,
        available: true,
        issue: null,
        source: 'open_food_facts',
        data: { brand_name: 'Coca-Cola', products, total: 2238, page: 1, page_size: 5 },
      })
      expect(search_products).toHaveBeenCalledWith({ product_name: 'Coca Cola', take: 5, page: 1 }, undefined)
      expect(search_brand).toHaveBeenCalledWith({ brand_name: 'Coca Cola', take: 5, page: 1 }, undefined)
      expect(inspect).toHaveBeenCalledTimes(2)
    } finally {
      search_products.mockRestore()
      search_brand.mockRestore()
    }
  })

  it('returns a structured unavailable result instead of throwing provider outages', async () => {
    const unavailable = Object.assign(new Error('private upstream details'), { code: 'open-food-facts-unavailable' })
    const search_brand = spyOn(service_product_provider, 'search_by_brand_name').mockRejectedValue(unavailable)
    try {
      expect(await lookup_tool(toolkit_product_lookup, 5).execute!({ brand_name: 'Coca Cola' })).toEqual({
        found: false,
        available: false,
        issue: 'temporarily_unavailable',
        source: 'open_food_facts',
        data: null,
      })
    } finally {
      search_brand.mockRestore()
    }
  })
})
