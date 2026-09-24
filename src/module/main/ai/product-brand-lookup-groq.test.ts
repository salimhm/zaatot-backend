import { createGroq } from '@ai-sdk/groq'
import { describe, expect, it, spyOn } from 'bun:test'

import { $agent_product_brand_lookup, agent_product_brand_lookup } from '@agent/product-brand-lookup/product-brand-lookup.agent'

import { service_brand } from '@module/main/brand/brand.service'

describe('Detective Groq request compatibility', () => {
  it('calls tools without JSON mode and builds the response from the returned records', async () => {
    const requests: Record<string, unknown>[] = []
    const mock_fetch: typeof fetch = Object.assign(
      async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const body = JSON.parse(init!.body as string) as Record<string, unknown>
        requests.push(body)
        // Reproduce the provider restriction after the real Groq SDK serializes the request.
        if (body.tools && body.response_format) {
          return Response.json(
            { error: { message: 'json mode cannot be combined with tool/function calling', type: 'invalid_request_error' } },
            { status: 400 },
          )
        }
        if (requests.length > 2) throw new Error('Unexpected extra model request')
        const first = requests.length === 1
        return Response.json({
          id: `lookup-test-${requests.length}`,
          object: 'chat.completion',
          created: 1,
          model: 'gemini-3.5-flash-lite',
          choices: [
            {
              index: 0,
              finish_reason: first ? 'tool_calls' : 'stop',
              message: first
                ? {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'lookup-call',
                        type: 'function',
                        function: {
                          name: 'tool_product_lookup_brand_by_name',
                          arguments: JSON.stringify({ brand_name: 'Example Brand' }),
                        },
                      },
                    ],
                  }
                : { role: 'assistant', content: 'Unverified final model text, not a JSON object.' },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        })
      },
      { preconnect: () => {} },
    )
    const transport = createGroq({ apiKey: 'test-key', fetch: mock_fetch })('gemini-3.5-flash-lite')
    const model = $agent_product_brand_lookup.model as typeof transport
    const generate = spyOn(model, 'doGenerate').mockImplementation((options) => transport.doGenerate(options))
    const find = spyOn(service_brand, 'find').mockResolvedValue({
      data: [{ brand_id: 1, brand_name: 'Example Brand' }],
      page: 1,
      take: 5,
      rows: 1,
      pages: 1,
    })
    let tool_calls = 0
    try {
      const result = await agent_product_brand_lookup('Find Example Brand', new AbortController().signal, {
        use_tool: async (call) => {
          tool_calls++
          return await call()
        },
        inspect_content: async (text) => text,
      })
      expect(result).toEqual({
        success: true,
        data: {
          query_type: 'brand',
          found: true,
          sources_checked: ['local_database'],
          products: [],
          brands: [{ source: 'local_database', brand_id: 1, name: 'Example Brand' }],
          message: 'Found 1 brand.',
        },
      })
      expect(requests).toHaveLength(2)
      for (const request of requests) {
        expect(request).not.toHaveProperty('response_format')
        expect(request.tools).toBeArray()
      }
      expect(find).toHaveBeenCalledTimes(1)
      expect(tool_calls).toBe(1)
      expect(requests[1]!.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'tool', tool_call_id: 'lookup-call', content: expect.stringContaining('local_database') }),
        ]),
      )
    } finally {
      generate.mockRestore()
      find.mockRestore()
    }
  })
})
