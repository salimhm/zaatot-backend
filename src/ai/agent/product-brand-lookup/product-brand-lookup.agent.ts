import type { product_lookup_runtime } from '@tool/product-lookup/product-lookup.tool'

import { groq } from '@ai-sdk/groq'
import { Agent } from '@voltagent/core'
import { Output } from 'ai'

import { prompt_agent_product_brand_lookup } from '@agent/product-brand-lookup/product-brand-lookup.prompt.agent'
import { schema_agent_product_brand_lookup } from '@agent/product-brand-lookup/product-brand-lookup.schema.agent'
import { create_product_lookup_toolkit, toolkit_product_lookup } from '@tool/product-lookup/product-lookup.tool'

export const $agent_product_brand_lookup = new Agent({
  id: 'product-brand-lookup',
  name: 'Ztroop Product and Brand Lookup',
  purpose: 'Retrieve factual product and brand information',
  instructions: prompt_agent_product_brand_lookup,
  model: groq(process.env.GROQ_DEFAULT_AI_MODEL_NAME || 'openai/gpt-oss-20b'),
  tools: [toolkit_product_lookup],
  memory: false,
})

export const agent_product_brand_lookup = async (message: string, signal?: AbortSignal, runtime?: product_lookup_runtime) => {
  try {
    signal?.throwIfAborted()
    let tool_error: Error | undefined
    const result = await $agent_product_brand_lookup.generateText(message, {
      output: Output.object({ schema: schema_agent_product_brand_lookup }),
      temperature: 0,
      maxSteps: 4,
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
    const data = schema_agent_product_brand_lookup.parse(result.output)

    return {
      success: true as const,
      data,
    }
  } catch (error) {
    return {
      success: false as const,
      data: error,
    }
  }
}
