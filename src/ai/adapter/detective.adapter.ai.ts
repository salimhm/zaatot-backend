import type { consumer_specialist_input, consumer_step_result } from '@ai/execution/execution-contract.ai'

import { agent_detective } from '@agent/detective/detective.agent'
import { schema_agent_detective } from '@agent/detective/detective.schema.agent'

// Workflow adapter: calls the agent and maps its validated output to the workflow step envelope.
export const adapter_detective = async (input: consumer_specialist_input, signal: AbortSignal): Promise<consumer_step_result> => {
  const result = await agent_detective(input.prompt, signal, {
    use_tool: input.use_tool,
    inspect_content: input.inspect_content,
  })
  if (!result.success) throw new Error('Detective lookup failed', { cause: result.data })

  const output = schema_agent_detective.parse(result.data)
  const resolved = output.status === 'identified' && output.subject !== null
  return {
    status: resolved ? 'completed' : 'needs_input',
    output,
    limitations: resolved
      ? []
      : [
          output.status === 'requires_selection'
            ? 'Detective found multiple possible matches. Select a brand or a specific product.'
            : output.status === 'unavailable'
              ? 'The external product provider is temporarily unavailable. Try again later.'
              : 'Detective could not resolve the product or brand. Provide a more specific name or barcode.',
        ],
  }
}
