import type { type_schema_input_agent_bargain_hunter } from '@agent/bargain-hunter/bargain-hunter.schema.agent'
import type { consumer_specialist_input, consumer_step_result } from '@ai/execution/execution-contract.ai'

import { agent_bargain_hunter } from '@agent/bargain-hunter/bargain-hunter.agent'
import { schema_agent_bargain_hunter, schema_input_agent_bargain_hunter } from '@agent/bargain-hunter/bargain-hunter.schema.agent'
import { schema_agent_detective } from '@agent/detective/detective.schema.agent'
import { schema_agent_referee } from '@agent/referee/referee.schema.agent'

const includes_any = (value: string, expressions: RegExp[]) => expressions.some((expression) => expression.test(value))

export const bargain_hunter_dimensions = (request: string): type_schema_input_agent_bargain_hunter['requested_dimensions'] => {
  const dimensions: Array<'boycott' | 'price' | 'environment' | 'health'> = []
  if (includes_any(request, [/boycott/i, /ethical/i, /ethics/i, /palestin/i, /israel/i, /مقاطعة/u])) dimensions.push('boycott')
  if (includes_any(request, [/cheap/i, /price/i, /cost/i, /afford/i, /budget/i, /ثمن/u, /رخيص/u])) dimensions.push('price')
  if (includes_any(request, [/environment/i, /eco[- ]?friendly/i, /sustainab/i, /packag/i, /بيئ/u])) dimensions.push('environment')
  if (includes_any(request, [/health/i, /nutrition/i, /allerg/i, /medical/i, /diet/i, /sugar/i, /salt/i, /صح/u])) dimensions.push('health')

  // Bargain Hunter v1 only has Boycat as a discovery source. A generic
  // alternative request therefore remains explicitly Boycat-sourced.
  return dimensions.length > 0 ? dimensions : ['boycott']
}

export const build_bargain_hunter_input = (
  input: Pick<consumer_specialist_input, 'prompt' | 'dependencies' | 'budgets'>,
): type_schema_input_agent_bargain_hunter | null => {
  const detective = schema_agent_detective.safeParse(input.dependencies.Detective?.output)
  const referee = schema_agent_referee.safeParse(input.dependencies.Referee?.output)
  if (!detective.success || !referee.success || detective.data.status !== 'identified' || !detective.data.subject) return null

  const subject = detective.data.subject
  const mapped_subject =
    subject.type === 'brand'
      ? { type: 'brand' as const, name: subject.name, brand: subject.name, barcode: null }
      : { type: 'product' as const, name: subject.name, brand: subject.brand_name, barcode: subject.barcode }

  return schema_input_agent_bargain_hunter.parse({
    request: input.prompt,
    subject: mapped_subject,
    requested_dimensions: bargain_hunter_dimensions(input.prompt),
    constraints: referee.data.constraints.map(({ code, action, message }) => ({ code, action, message })),
    max_candidates: Math.max(1, Math.min(3, input.budgets.max_alternative_candidates || 1)),
  })
}

export const adapter_bargain_hunter = async (input: consumer_specialist_input, signal: AbortSignal): Promise<consumer_step_result> => {
  signal.throwIfAborted()
  const referee = schema_agent_referee.safeParse(input.dependencies.Referee?.output)
  if (referee.success && referee.data.decision === 'block') {
    return {
      status: 'blocked',
      output: null,
      limitations: referee.data.constraints.filter((constraint) => constraint.action === 'block').map((constraint) => constraint.message),
    }
  }

  const agent_input = build_bargain_hunter_input(input)
  if (!agent_input) {
    return {
      status: 'needs_input',
      output: null,
      limitations: ['Bargain Hunter requires an identified subject and a completed Referee result.'],
    }
  }

  const result = await agent_bargain_hunter(agent_input, signal, {
    use_tool: input.use_tool,
    inspect_content: input.inspect_content,
  })
  if (!result.success) throw new Error('Bargain Hunter alternative retrieval failed', { cause: result.data })
  const output = schema_agent_bargain_hunter.parse(result.data)

  return {
    status: output.status === 'unavailable' ? 'partial' : output.status === 'insufficient_data' ? 'needs_input' : 'completed',
    output,
    limitations: output.limitations,
  }
}
