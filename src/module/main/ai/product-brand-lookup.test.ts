import { describe, expect, it, mock, spyOn } from 'bun:test'
import type { product_lookup_runtime } from '@tool/product-lookup/product-lookup.tool'
import type { Toolkit } from '@voltagent/core'

import { Tool } from '@voltagent/core'

import { $agent_product_brand_lookup, agent_product_brand_lookup } from '@agent/product-brand-lookup/product-brand-lookup.agent'
import { create_product_lookup_toolkit, toolkit_product_lookup } from '@tool/product-lookup/product-lookup.tool'

import { service_product_provider } from '@module/main/product-provider/product-provider.service'
import { service_product } from '@module/main/product/product.service'

function lookup_tool(toolkit: Toolkit, index: number) {
  const tool = toolkit.tools[index]
  if (!(tool instanceof Tool)) throw new Error('Expected a VoltAgent lookup tool')
  return tool
}

describe('Product-brand lookup workflow integration', () => {
  it('validates structured lookup output and rejects the old message-only shape', async () => {
    const generate = spyOn($agent_product_brand_lookup, 'generateText')
    const signal = new AbortController().signal
    try {
      const output = { query_type: 'brand', found: true, message: 'Brand information from the local database.' } as const
      generate.mockResolvedValue({ output } as Awaited<ReturnType<typeof $agent_product_brand_lookup.generateText>>)
      expect(await agent_product_brand_lookup('Find this brand', signal)).toEqual({ success: true, data: output })
      expect(generate.mock.calls[0]![1]?.output).toBeDefined()
      expect(generate.mock.calls[0]![1]?.abortSignal).toBe(signal)
      expect(generate.mock.calls[0]![1]?.maxRetries).toBe(0)

      generate.mockResolvedValue({ output: { message: 'Incomplete output' } } as Awaited<ReturnType<typeof $agent_product_brand_lookup.generateText>>)
      expect((await agent_product_brand_lookup('Find this brand', signal)).success).toBe(false)
    } finally {
      generate.mockRestore()
    }
  })

  it('does not start a cancelled lookup and discards a result arriving after cancellation', async () => {
    const controller = new AbortController()
    const generate = spyOn($agent_product_brand_lookup, 'generateText')
    try {
      controller.abort()
      expect((await agent_product_brand_lookup('Find this brand', controller.signal)).success).toBe(false)
      expect(generate).not.toHaveBeenCalled()

      const late = new AbortController()
      generate.mockImplementation(async () => {
        late.abort()
        return { output: { query_type: 'brand', found: true, message: 'Late result' } } as Awaited<
          ReturnType<typeof $agent_product_brand_lookup.generateText>
        >
      })
      expect((await agent_product_brand_lookup('Find this brand', late.signal)).success).toBe(false)
    } finally {
      generate.mockRestore()
    }
  })

  it('does not accept a successful-looking answer after a tool failure', async () => {
    const error = new Error('Lookup failed')
    const generate = spyOn($agent_product_brand_lookup, 'generateText').mockImplementation(async (_message, options) => {
      const on_error = options!.hooks!.onToolError!
      await on_error({ originalError: error } as Parameters<typeof on_error>[0])
      return { output: { query_type: 'product', found: true, message: 'Unsupported result' } } as Awaited<
        ReturnType<typeof $agent_product_brand_lookup.generateText>
      >
    })
    try {
      expect(await agent_product_brand_lookup('Find this product')).toEqual({ success: false, data: error })
    } finally {
      generate.mockRestore()
    }
  })

  it('charges each tool call to its request budget without changing the shared toolkit', async () => {
    const find = spyOn(service_product, 'find').mockResolvedValue({ data: [], page: 1, take: 5, rows: 0, pages: 0 })
    let calls = 0
    const runtime: product_lookup_runtime = {
      use_tool: async (call) => {
        if (calls >= 1) throw new Error('Budget exhausted')
        calls++
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
    const inspect = mock(async (_text: string) => 'Inspected product facts')
    const toolkit = create_product_lookup_toolkit({ use_tool: async (call) => await call(), inspect_content: inspect })
    const lookup = lookup_tool(toolkit, 2)
    try {
      expect(await lookup.execute!({ barcode: '1234567890' })).toEqual({ found: true, source: 'open_food_facts', data: 'Inspected product facts' })
      expect(inspect).toHaveBeenCalledWith(JSON.stringify({ product_name: 'Untrusted name' }))

      inspect.mockRejectedValue(new Error('Bait Tester is not implemented'))
      await expect(lookup.execute!({ barcode: '1234567890' }) as Promise<unknown>).rejects.toThrow('Bait Tester is not implemented')

      provider.mockResolvedValue(null)
      expect(await lookup.execute!({ barcode: '1234567890' })).toEqual({ found: false, source: 'open_food_facts', data: null })
      expect(inspect).toHaveBeenCalledTimes(2)
    } finally {
      provider.mockRestore()
    }
  })
})
