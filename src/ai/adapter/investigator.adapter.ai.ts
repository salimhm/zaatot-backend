import type { consumer_specialist_input, consumer_step_result } from '@ai/execution/execution-contract.ai'

import { schema_agent_detective } from '@agent/detective/detective.schema.agent'
import { agent_investigator } from '@agent/investigator/investigator.agent'
import { schema_agent_investigator } from '@agent/investigator/investigator.schema.agent'

// Workflow adapter: calls the agent and maps its validated output to the workflow step envelope.
export const adapter_investigator = async (input: consumer_specialist_input, signal: AbortSignal): Promise<consumer_step_result> => {
  const detective_step = input.dependencies.Detective
  if (detective_step?.status !== 'completed') {
    return {
      status: 'needs_input',
      output: null,
      limitations: ['Investigator requires a product or brand identity resolved by Detective.'],
    }
  }

  const detective = schema_agent_detective.parse(detective_step.output)
  if (detective.status !== 'identified' || !detective.subject) {
    return {
      status: 'needs_input',
      output: null,
      limitations: ['Investigator requires one resolved product or brand identity.'],
    }
  }

  const subject =
    detective.subject.type === 'brand'
      ? { brand_name: detective.subject.name, brand_candidates: [detective.subject.name] }
      : {
          brand_name: detective.subject.brand_name,
          brand_candidates: detective.subject.brand_candidates,
          ...(detective.subject.name ? { product_name: detective.subject.name } : {}),
        }
  const result = await agent_investigator(subject, {
    include_analysis_draft: false,
    signal,
    runtime: {
      use_tool: input.use_tool,
      inspect_content: input.inspect_content,
    },
  })
  if (!result.success) throw new Error('Investigator evidence lookup failed', { cause: result.data })

  const output = schema_agent_investigator.parse(result.data)
  const status =
    output.status === 'evidence_found' || output.status === 'no_matching_evidence'
      ? 'completed'
      : output.status === 'needs_input'
        ? 'needs_input'
        : 'needs_review'
  return {
    status,
    output,
    limitations: output.limitations,
  }
}
