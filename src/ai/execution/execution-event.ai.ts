import type { type_ai_workflow_step } from '@agent/conductor/conductor.schema.agent'
import type { consumer_specialist_name, consumer_step_result } from '@ai/execution/execution-contract.ai'

import { schema_agent_detective } from '@agent/detective/detective.schema.agent'
import { schema_agent_investigator } from '@agent/investigator/investigator.schema.agent'
import { schema_agent_medic } from '@agent/medic/medic.schema.agent'

// User-facing titles and statuses for specialist step events in the live activity feed.

export const agent_title = (agent: consumer_specialist_name) => {
  if (agent === 'Detective') return 'Looking up the product or brand'
  if (agent === 'Medic') return 'Checking allergens and ingredients'
  if (agent === 'Investigator') return 'Investigating the resolved brand'
  return `Running ${agent}`
}

export const agent_completion = (agent: consumer_specialist_name, result: consumer_step_result) => {
  if (agent === 'Detective') {
    const output = schema_agent_detective.safeParse(result.output)
    if (output.success && output.data.status === 'identified' && output.data.subject) {
      return { title: `Identified ${output.data.subject.name}`, detail: output.data.message }
    }
    if (output.success) return { title: 'Product lookup finished', detail: output.data.message }
  }
  if (agent === 'Medic') {
    const output = schema_agent_medic.safeParse(result.output)
    if (output.success) {
      const title =
        output.data.status === 'flags_found'
          ? 'Ingredient or allergen concern found'
          : output.data.status === 'no_flags_detected'
            ? 'Ingredient and allergen check finished'
            : 'Ingredient and allergen check needs evidence'
      return { title, detail: output.data.summary }
    }
  }
  if (agent === 'Investigator') {
    const output = schema_agent_investigator.safeParse(result.output)
    if (output.success) {
      const brand = output.data.subject.brand_name ?? 'the resolved brand'
      const title = output.data.status === 'evidence_found' ? `Evidence found for ${brand}` : `Investigation finished for ${brand}`
      return { title, detail: output.data.message }
    }
  }
  return { title: `${agent} finished`, detail: result.limitations[0] ?? null }
}

// Internal statuses that the public step schema does not have.
export const event_status = (status: consumer_step_result['status']): type_ai_workflow_step['status'] => {
  if (status === 'repair_required') return 'needs_review'
  if (status === 'not_implemented') return 'skipped'
  return status
}
