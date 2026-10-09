import type { consumer_specialist_input, consumer_step_result } from '@ai/execution/execution-contract.ai'

import { schema_agent_detective } from '@agent/detective/detective.schema.agent'
import { agent_eco_scout } from '@agent/eco-scout/eco-scout.agent'
import { schema_agent_eco_scout, schema_input_agent_eco_scout } from '@agent/eco-scout/eco-scout.schema.agent'

// Workflow adapter: Eco Scout depends on Detective's resolved, exact product.
export const adapter_eco_scout = async (input: consumer_specialist_input, signal: AbortSignal): Promise<consumer_step_result> => {
  signal.throwIfAborted()
  const detective_step = input.dependencies.Detective
  if (detective_step?.status !== 'completed') {
    return {
      status: 'needs_input',
      output: null,
      limitations: ['Eco Scout requires Detective to resolve an exact product variant first.'],
    }
  }

  const detective = schema_agent_detective.parse(detective_step.output)
  const subject = detective.subject
  if (detective.status !== 'identified' || subject?.type !== 'product' || !subject.barcode) {
    return {
      status: 'needs_input',
      output: null,
      limitations: ['Eco Scout requires an exact product variant or barcode. Brand-level evidence is not used as product environmental evidence.'],
    }
  }

  const product = detective.related_products.items.find((item) => item.barcode === subject.barcode)
  if (!product || !product.barcode) {
    return {
      status: 'needs_review',
      output: null,
      limitations: ['Eco Scout could not find the resolved exact variant in Detective’s verified product facts.'],
    }
  }

  // Detective accepts any barcode string, but environmental facts are only published for a GTIN-style variant.
  if (!schema_input_agent_eco_scout.shape.product.shape.barcode.safeParse(product.barcode).success) {
    return {
      status: 'needs_review',
      output: null,
      limitations: ['Eco Scout could not verify the resolved product barcode, so it did not publish environmental evidence for it.'],
    }
  }

  const result = await agent_eco_scout(
    {
      product: {
        source: product.source,
        barcode: product.barcode,
        name: product.name?.trim() || null,
        brand_name: product.brand_name?.trim() || null,
        ecoscore: product.ecoscore,
        packaging: product.packaging ?? null,
        retrieved_at: product.retrieved_at ?? null,
      },
    },
    signal,
  )
  if (!result.success) throw new Error('Eco Scout environmental assessment failed', { cause: result.data })
  const output = schema_agent_eco_scout.parse(result.data)
  signal.throwIfAborted()

  return {
    status: output.status === 'available' ? 'completed' : 'partial',
    output,
    limitations: output.limitations,
  }
}
