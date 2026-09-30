import type { consumer_specialist_input } from '@ai/execution/execution-contract.ai'

import { unique_strings } from '@ai/adapter/utils.adapter.ai'
import { agent_skeptic } from '@agent/skeptic/skeptic.agent'
import { build_skeptic_ledger } from '@agent/skeptic/skeptic.ledger.agent'
import { schema_agent_skeptic } from '@agent/skeptic/skeptic.schema.agent'

// Workflow adapter: calls the agent and maps its validated output to the workflow step envelope.
export const adapter_skeptic = async (input: consumer_specialist_input, signal: AbortSignal) => {
  signal.throwIfAborted()
  const ledger = build_skeptic_ledger(input.dependencies)
  if (!ledger) {
    return {
      status: 'needs_input' as const,
      output: null,
      limitations: ['Skeptic requires one product or brand identity resolved by Detective.'],
    }
  }

  const result = await agent_skeptic(ledger, signal)
  if (!result.success) throw new Error('Skeptic evidence review failed', { cause: result.data })

  const output = schema_agent_skeptic.parse(result.data)
  const limitations = unique_strings([
    ...output.unsupported_claims.map((claim) => claim.reason),
    ...output.stale_sources.map((source) => source.reason),
    ...output.uncertainties.map((uncertainty) => uncertainty.issue),
    ...(output.status === 'unavailable' ? ['Skeptic could not assess the supplied evidence ledger.'] : []),
  ])
  return {
    status: output.status === 'reviewed' ? ('completed' as const) : ('needs_review' as const),
    output,
    limitations,
  }
}
