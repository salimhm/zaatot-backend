import { groq } from '@ai-sdk/groq'
import { Agent } from '@voltagent/core'

import { prompt_agent_product_brand_lookup } from '@agent/product-brand-lookup/product-brand-lookup.prompt.agent'
import { schema_agent_product_brand_lookup } from '@agent/product-brand-lookup/product-brand-lookup.schema.agent'

import { toolkit_product_lookup } from '@tool/product-lookup/product-lookup.tool'

export const $agent_product_brand_lookup = new Agent({
  id: 'product-brand-lookup',
  name: 'Ztroop Product and Brand Lookup',
  purpose: 'Retrieve factual product and brand information',
  instructions: prompt_agent_product_brand_lookup,
  model: groq(
    process.env.GROQ_DEFAULT_AI_MODEL_NAME || 'openai/gpt-oss-20b',
  ),
  tools: [toolkit_product_lookup],
  memory: false,
})

export const agent_product_brand_lookup = async (
  message: string,
): Promise<{ success: boolean; data: any }> => {
  try {
    const result = await $agent_product_brand_lookup.generateText(message, {
      temperature: 0,
      maxSteps: 4,
    })

    const data = schema_agent_product_brand_lookup.parse({
      message: result.text,
    })

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
