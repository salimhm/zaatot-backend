import type {
  type_input_agent_historian,
  type_input_agent_historian_request,
  type_schema_agent_historian,
} from '@agent/historian/historian.schema.agent'

import { Agent } from '@voltagent/core'
import { Output } from 'ai'

import { trusted_agent_generation_options } from '@ai/generation.ai'
import { ai_cloudflare, ai_cloudflare_default_model } from '@ai/provider.ai'
import { prompt_agent_historian, prompt_agent_historian_request } from '@agent/historian/historian.prompt.agent'
import {
  schema_agent_historian,
  schema_agent_historian_request,
  schema_input_agent_historian,
  schema_input_agent_historian_request,
} from '@agent/historian/historian.schema.agent'

const historian_model = ai_cloudflare(process.env.CF_HISTORIAN_MODEL || ai_cloudflare_default_model)

// Call 1: reads the question in any language. It only labels a period and focus;
// resolve_historian_window validates the period and does all date arithmetic.
export const $agent_historian_request = new Agent({
  id: 'historian-request',
  name: 'Historian Request Reader',
  purpose: 'Convert a question about past scans into a structured period and focus',
  instructions: prompt_agent_historian_request,
  model: historian_model,
  tools: [],
  memory: false,
})

// Call 2: describes patterns that the analysis code already computed. It never reads raw scans.
export const $agent_historian = new Agent({
  id: 'historian',
  name: 'Historian',
  purpose: 'Describe computed patterns in the user’s permitted scan history without inferring consumption',
  instructions: prompt_agent_historian,
  model: historian_model,
  tools: [],
  memory: false,
})

export const agent_historian_request = async (input: type_input_agent_historian_request, signal?: AbortSignal) => {
  try {
    const data = schema_input_agent_historian_request.parse(input)
    signal?.throwIfAborted()
    const result = await $agent_historian_request.generateText(JSON.stringify(data), {
      ...trusted_agent_generation_options,
      output: Output.object({ schema: schema_agent_historian_request }),
      temperature: 0,
      maxSteps: 1,
      maxRetries: 0,
      abortSignal: signal,
    })
    signal?.throwIfAborted()
    return { success: true as const, data: schema_agent_historian_request.parse(result.output) }
  } catch (error) {
    return { success: false as const, data: error }
  }
}

// The model describes; the backend enforces that it only cites computed patterns.
export const finalize_historian_review = (input: type_input_agent_historian, output: type_schema_agent_historian): type_schema_agent_historian => {
  if (output.status !== input.analysis.status) {
    throw new Error(`Historian reported ${output.status} for an analysis that is ${input.analysis.status}`)
  }
  if (output.status === 'insufficient_history' && output.findings.length > 0) {
    throw new Error('Historian must not report findings when the history is insufficient')
  }

  const pattern_ids = new Set(input.analysis.patterns.map((pattern) => pattern.id))
  const cited = new Set<string>()
  for (const finding of output.findings) {
    if (!pattern_ids.has(finding.pattern_id)) throw new Error(`Historian cited unknown pattern ${finding.pattern_id}`)
    if (cited.has(finding.pattern_id)) throw new Error(`Historian cited pattern ${finding.pattern_id} more than once`)
    cited.add(finding.pattern_id)
  }

  return output
}

export const agent_historian = async (input: type_input_agent_historian, signal?: AbortSignal) => {
  try {
    const data = schema_input_agent_historian.parse(input)
    signal?.throwIfAborted()
    const result = await $agent_historian.generateText(JSON.stringify(data), {
      ...trusted_agent_generation_options,
      output: Output.object({ schema: schema_agent_historian }),
      temperature: 0,
      maxSteps: 1,
      maxRetries: 0,
      abortSignal: signal,
    })
    signal?.throwIfAborted()
    return { success: true as const, data: finalize_historian_review(data, schema_agent_historian.parse(result.output)) }
  } catch (error) {
    return { success: false as const, data: error }
  }
}
