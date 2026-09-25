import type { type_schema_agent_bodyguard } from '@agent/bodyguard/bodyguard.schema.agent'
import type {
  type_ai_workflow_step,
  type_schema_agent_conductor_input,
  type_schema_agent_conductor_plan,
  type_schema_agent_conductor_result,
} from '@agent/conductor/conductor.schema.agent'
import type { type_schema_agent_dispatcher } from '@agent/dispatcher/dispatcher.schema.agent'
import type { type_schema_agent_investigator } from '@agent/investigator/investigator.schema.agent'
import type { ai_tool_activity } from '@ai/runtime.ai'

import { z } from 'zod'

import { run_workflow_step } from '@ai/runtime.ai'
import { schema_agent_conductor_result } from '@agent/conductor/conductor.schema.agent'
import { schema_agent_detective } from '@agent/detective/detective.schema.agent'
import { schema_agent_investigator } from '@agent/investigator/investigator.schema.agent'

export type consumer_specialist_name = type_schema_agent_dispatcher['selected_agents'][number]['agent']
export type consumer_event_reporter = (event: Omit<type_ai_workflow_step, 'sequence' | 'execution_id' | 'timestamp'>) => void

// Adapters validate their own agent output before returning this workflow envelope.
const schema_step_result = z.object({
  status: z.enum(['completed', 'partial', 'blocked', 'needs_input', 'needs_review', 'error', 'repair_required', 'skipped', 'not_implemented']),
  output: z.unknown(),
  limitations: z.array(z.string()),
  permissions: z.object({ personalization: z.boolean(), history: z.boolean() }).optional(),
})

export type consumer_step_result = z.infer<typeof schema_step_result>

export type consumer_specialist_input = {
  prompt: string
  execution_id: string
  /** Supplied only to Vault Keeper; retrieve permitted fields through services. */
  user_id?: number
  dependencies: Partial<Record<consumer_specialist_name, consumer_step_result>>
  candidate_review: consumer_step_result | null
  feedback?: consumer_step_result
  budgets: type_schema_agent_dispatcher['budgets']
  /** Adapters must wrap each real tool call to charge the shared budget. */
  use_tool: <T>(call: () => Promise<T>, activity?: ai_tool_activity) => Promise<T>
  /** Inspect external free text before passing it to an agent. No private context is supplied. */
  inspect_content: (text: string) => Promise<string>
}

export type consumer_specialist = (input: consumer_specialist_input, signal: AbortSignal) => Promise<consumer_step_result>

export type consumer_execution_dependency = {
  specialists?: Partial<Record<consumer_specialist_name, consumer_specialist | null>>
  /** Rerun applicable checks on bounded alternative candidates before Storyteller. */
  candidate_review?: consumer_specialist | null
  bait_tester?: ((text: string, signal: AbortSignal) => Promise<{ usable: boolean; text: string }>) | null
}

export type consumer_execution_data = type_schema_agent_conductor_input & {
  execution_id: string
  bodyguard: type_schema_agent_bodyguard
  plan: type_schema_agent_conductor_plan | null
  dispatcher_plan: type_schema_agent_dispatcher | null
  agent_results: Partial<Record<consumer_specialist_name, consumer_step_result>>
  candidate_review: consumer_step_result | null
}

export type consumer_parallel_result = {
  data: consumer_execution_data
  updates: consumer_execution_data['agent_results']
}

const skipped = (reason: string): consumer_step_result => ({ status: 'skipped', output: null, limitations: [reason] })
const placeholder = (name: string): consumer_step_result => ({
  status: 'not_implemented',
  output: null,
  limitations: [`${name} is not implemented. Its required work has not been executed.`],
})

const readable_label = (value: string) => value.replaceAll('_', ' ')

const valid_source_url = (...values: Array<string | null | undefined>): string | null => {
  for (const value of values) {
    if (!value) continue
    try {
      const url = new URL(value)
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString()
    } catch {
      // Ignore malformed provider URLs instead of invalidating the complete API response.
    }
  }
  return null
}

const summarize_investigator = (output: type_schema_agent_investigator): string => {
  const checks = output.checks.map((check) => {
    const source = readable_label(check.source)
    const entity = check.matched_entity?.name ?? output.subject.brand_name ?? 'the requested brand'
    const decision = check.decision_status ? readable_label(check.decision_status) : 'no decision'
    const confidence = check.confidence === null ? '' : `, ${check.confidence}% confidence`
    const reason = check.reason ? ` ${check.reason}` : ''

    if (check.status === 'matched') return `${source}: ${decision} for ${entity}${confidence}.${reason}`
    return `${source}: ${readable_label(check.status)}.${reason}`
  })

  return [output.message, ...checks].join(' ')
}

const collect_investigator_sources = (output: type_schema_agent_investigator) => {
  const sources: type_schema_agent_conductor_result['sources'] = []
  const source_ids: string[] = []
  const ids_by_key = new Map<string, string>()

  for (const check of output.checks) {
    for (const citation of check.citations) {
      const url = valid_source_url(citation.url, citation.source_url)
      const provider = citation.source_name.trim() || readable_label(check.source)
      const key = `${provider}\u0000${url ?? citation.title ?? ''}`
      let id = ids_by_key.get(key)
      if (!id) {
        id = `investigator-source-${sources.length + 1}`
        ids_by_key.set(key, id)
        sources.push({ id, provider, url, retrieved_at: output.checked_at })
      }
      if (!source_ids.includes(id)) source_ids.push(id)
    }
  }

  return { sources, source_ids }
}

// TEMPORARY: replace this deterministic presenter when Storyteller/Gatekeeper are implemented.
const build_temporary_explanation = (
  subject: NonNullable<type_schema_agent_conductor_result['subject']>,
  outcome: NonNullable<type_schema_agent_conductor_result['outcome']>,
  investigator: type_schema_agent_investigator | null,
  citation_ids: string[],
): NonNullable<type_schema_agent_conductor_result['explanation']> => {
  const summaries: Record<typeof outcome, string> = {
    evidence_found: `Boycott-related evidence was found for ${subject.name} in the sources checked by Ztroop. This is sourced evidence rather than a final independent judgment.`,
    no_matching_evidence: `No matching boycott-related evidence was found for ${subject.name} in the sources checked by Ztroop. This does not prove that the brand is safe.`,
    needs_input: `More information is required before Ztroop can investigate ${subject.name}.`,
    needs_review: `The evidence or identity associated with ${subject.name} requires review before drawing a conclusion.`,
    unavailable: `Ztroop could not check every required evidence source for ${subject.name}. Try again later.`,
  }
  const reasons = [
    ...new Set((investigator?.checks ?? []).filter((check) => check.status === 'matched' && check.reason).map((check) => check.reason as string)),
  ].slice(0, 4)

  return {
    summary: summaries[outcome],
    reasons,
    tradeoffs: investigator?.limitations ?? [],
    citation_ids,
  }
}

// andAll returns an array. Merge only each branch's own additions, preserving the common input.
export const merge_consumer_parallel = (branches: consumer_parallel_result[]): consumer_execution_data => {
  const first = branches[0]
  if (!first) throw new Error('A parallel workflow stage must contain at least one branch')
  return {
    ...first.data,
    agent_results: Object.assign({}, first.data.agent_results, ...branches.map((branch) => branch.updates)),
  }
}

// One executor per request, sharing its deadline and counters across parallel branches and repairs.
export const create_consumer_execution = (
  dependency: consumer_execution_dependency,
  parent_signal: AbortSignal,
  deadline_ms: number,
  report_event: consumer_event_reporter = () => undefined,
) => {
  let signal = parent_signal
  let execution_deadline = deadline_ms
  let tool_calls = 0
  let budget_exhausted = false
  let budgets: type_schema_agent_dispatcher['budgets'] | null = null
  let execution_id = ''

  const check_deadline = () => {
    signal.throwIfAborted()
    if (performance.now() >= execution_deadline) throw new DOMException('Workflow deadline exceeded', 'TimeoutError')
  }

  const use_tool = async <T>(call: () => Promise<T>, activity?: ai_tool_activity, agent: consumer_specialist_name | null = null): Promise<T> => {
    check_deadline()
    if (!budgets || tool_calls >= budgets.max_tool_calls) {
      budget_exhausted = true
      throw new Error('The shared workflow tool-call budget is exhausted')
    }
    tool_calls++
    const step_id = crypto.randomUUID()
    const started_at = performance.now()
    const tool = activity?.name ?? 'workflow-tool'
    const title = activity?.title ?? 'Calling a workflow tool'
    report_event({
      step_id,
      type: 'tool.started',
      agent,
      status: 'running',
      title,
      detail: activity?.detail ?? null,
      metadata: { tool, duration_ms: null },
    })
    try {
      const result = await run_workflow_step(execution_id, tool, signal, call)
      check_deadline()
      const result_detail =
        result && typeof result === 'object' && 'available' in result && result.available === false
          ? 'The external source was unavailable.'
          : result && typeof result === 'object' && 'found' in result
            ? result.found === true
              ? 'A matching record was found.'
              : 'No matching record was found.'
            : 'The tool call completed.'
      report_event({
        step_id,
        type: 'tool.completed',
        agent,
        status: 'completed',
        title,
        detail: result_detail,
        metadata: { tool, duration_ms: Math.round(performance.now() - started_at) },
      })
      return result
    } catch (error) {
      report_event({
        step_id,
        type: 'tool.failed',
        agent,
        status: 'error',
        title,
        detail: 'The tool call could not be completed.',
        metadata: { tool, duration_ms: Math.round(performance.now() - started_at) },
      })
      throw error
    }
  }

  const inspect_content = async (text: string, consuming_agent: consumer_specialist_name | null = null) => {
    check_deadline()
    if (!dependency.bait_tester) throw new Error('Bait Tester is not implemented; external text cannot be consumed')
    const inspect = dependency.bait_tester
    const step_id = crypto.randomUUID()
    const started_at = performance.now()
    report_event({
      step_id,
      type: 'agent.started',
      agent: 'Bait Tester',
      status: 'running',
      title: 'Inspecting external content',
      detail: consuming_agent ? `Checking content before ${consuming_agent} uses it.` : 'Checking untrusted external content.',
      metadata: { tool: null, duration_ms: null },
    })
    try {
      const result = await run_workflow_step(execution_id, 'bait-tester', signal, () => inspect(text, signal))
      check_deadline()
      if (result.usable !== true || typeof result.text !== 'string') throw new Error('Bait Tester did not approve this external text')
      report_event({
        step_id,
        type: 'agent.completed',
        agent: 'Bait Tester',
        status: 'completed',
        title: 'External content approved',
        detail: 'The retrieved content passed the isolation check.',
        metadata: { tool: null, duration_ms: Math.round(performance.now() - started_at) },
      })
      return result.text
    } catch (error) {
      report_event({
        step_id,
        type: 'agent.failed',
        agent: 'Bait Tester',
        status: 'error',
        title: 'External content rejected',
        detail: 'The retrieved content could not be approved for downstream use.',
        metadata: { tool: null, duration_ms: Math.round(performance.now() - started_at) },
      })
      throw error
    }
  }

  const initialize = (data: Omit<consumer_execution_data, 'agent_results' | 'candidate_review'>): consumer_execution_data => {
    check_deadline()
    execution_id = data.execution_id
    budgets = data.dispatcher_plan ? { ...data.dispatcher_plan.budgets } : null
    if (budgets) {
      execution_deadline = Math.min(deadline_ms, performance.now() + budgets.timeout_ms)
      const remaining_ms = Math.floor(execution_deadline - performance.now())
      if (remaining_ms <= 0) throw new DOMException('Workflow deadline exceeded', 'TimeoutError')
      signal = AbortSignal.any([parent_signal, AbortSignal.timeout(remaining_ms)])
    }
    return { ...data, agent_results: {}, candidate_review: null }
  }

  const agent_title = (agent: consumer_specialist_name) => {
    if (agent === 'Detective') return 'Looking up the product or brand'
    if (agent === 'Investigator') return 'Investigating the resolved brand'
    return `Running ${agent}`
  }

  const agent_completion = (agent: consumer_specialist_name, result: consumer_step_result) => {
    if (agent === 'Detective') {
      const output = schema_agent_detective.safeParse(result.output)
      if (output.success && output.data.status === 'identified' && output.data.subject) {
        return { title: `Identified ${output.data.subject.name}`, detail: output.data.message }
      }
      if (output.success) return { title: 'Product lookup finished', detail: output.data.message }
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

  const event_status = (status: consumer_step_result['status']): type_ai_workflow_step['status'] => {
    if (status === 'repair_required') return 'needs_review'
    if (status === 'not_implemented') return 'skipped'
    return status
  }

  const invoke = async (
    step: string,
    handler: consumer_specialist,
    input: consumer_specialist_input,
    agent?: consumer_specialist_name,
  ): Promise<consumer_step_result> => {
    const step_id = crypto.randomUUID()
    const started_at = performance.now()
    if (agent) {
      report_event({
        step_id,
        type: 'agent.started',
        agent,
        status: 'running',
        title: agent_title(agent),
        detail: agent === 'Detective' ? `Resolving “${input.prompt}”.` : null,
        metadata: { tool: null, duration_ms: null },
      })
    }

    try {
      for (let attempt = 0; ; attempt++) {
        check_deadline()
        let result: consumer_step_result
        if (budget_exhausted) {
          result = { status: 'needs_review', output: null, limitations: ['The shared tool-call budget is exhausted.'] }
        } else {
          try {
            result = await run_workflow_step(input.execution_id, step, signal, async () => schema_step_result.parse(await handler(input, signal)))
            check_deadline()
            if (budget_exhausted) {
              result = { status: 'needs_review', output: null, limitations: ['The shared tool-call budget is exhausted.'] }
            }
          } catch (error) {
            if (signal.aborted) throw error
            check_deadline()
            if (!budget_exhausted && attempt < (budgets?.max_retries ?? 0)) continue
            result = {
              status: 'needs_review',
              output: null,
              limitations: [budget_exhausted ? 'The shared tool-call budget is exhausted.' : 'The agent could not produce a validated result.'],
            }
          }
        }

        if (agent) {
          const completion = agent_completion(agent, result)
          report_event({
            step_id,
            type: 'agent.completed',
            agent,
            status: event_status(result.status),
            title: completion.title,
            detail: completion.detail,
            metadata: { tool: null, duration_ms: Math.round(performance.now() - started_at) },
          })
        }
        return result
      }
    } catch (error) {
      if (agent) {
        report_event({
          step_id,
          type: 'agent.failed',
          agent,
          status: 'error',
          title: `${agent} failed`,
          detail: 'The agent could not complete its assigned work.',
          metadata: { tool: null, duration_ms: Math.round(performance.now() - started_at) },
        })
      }
      throw error
    }
  }

  const input_for = (
    data: consumer_execution_data,
    required: consumer_specialist_name[],
    agent: consumer_specialist_name | null = null,
  ): consumer_specialist_input => {
    if (!budgets) throw new Error('Specialist execution requires a Dispatcher plan')
    return {
      prompt: data.prompt,
      execution_id: data.execution_id,
      dependencies: Object.fromEntries(required.map((name) => [name, data.agent_results[name]])),
      candidate_review: data.candidate_review,
      budgets: {
        ...budgets,
        timeout_ms: Math.max(0, Math.floor(execution_deadline - performance.now())),
        max_tool_calls: Math.max(0, budgets.max_tool_calls - tool_calls),
      },
      use_tool: (call, activity) => use_tool(call, activity, agent),
      inspect_content: (text) => inspect_content(text, agent),
    }
  }

  const execute = async (agent: consumer_specialist_name, data: consumer_execution_data, feedback?: consumer_step_result) => {
    check_deadline()
    const step = data.dispatcher_plan?.selected_agents.find((selected) => selected.agent === agent)
    if (!step) return undefined
    const handler = dependency.specialists?.[agent]
    // The workflow definition includes future slots, but only connected adapters
    // participate in the current execution.
    if (!handler) return undefined

    const permissions = data.agent_results['Vault Keeper']?.permissions
    const report_skipped = (reason: string) => {
      report_event({
        step_id: crypto.randomUUID(),
        type: 'agent.skipped',
        agent,
        status: 'skipped',
        title: `${agent} skipped`,
        detail: reason,
        metadata: { tool: null, duration_ms: 0 },
      })
      return skipped(reason)
    }
    if (step.run_when === 'personalization_permitted' && permissions?.personalization !== true) {
      return report_skipped('Vault Keeper has not permitted personalization.')
    }
    if (step.run_when === 'history_permitted' && permissions?.history !== true) return report_skipped('Vault Keeper has not permitted history use.')
    const unavailable = step.depends_on.filter((name) => data.agent_results[name]?.status !== 'completed')
    if (unavailable.length) return report_skipped(`Required inputs are unavailable: ${unavailable.join(', ')}.`)
    if (
      agent === 'Storyteller' &&
      data.dispatcher_plan?.candidate_validation === 'repeat_required_checks' &&
      data.candidate_review?.status !== 'completed'
    ) {
      return report_skipped('Alternative candidates have not passed the required review.')
    }

    const input = input_for(data, step.depends_on, agent)
    if (agent === 'Vault Keeper') input.user_id = data.user_id
    if (feedback) input.feedback = feedback
    const result = await invoke(agent.toLowerCase().replaceAll(' ', '-'), handler, input, agent)
    // Only Vault Keeper can grant permissions; agent-local data stays internal until final review.
    if (agent !== 'Vault Keeper') delete result.permissions
    return result
  }

  const parallel = async (agent: consumer_specialist_name, data: consumer_execution_data): Promise<consumer_parallel_result> => {
    const result = await execute(agent, data)
    return { data, updates: result ? { [agent]: result } : {} }
  }

  const run = async (
    agent: consumer_specialist_name,
    data: consumer_execution_data,
    feedback?: consumer_step_result,
  ): Promise<consumer_execution_data> => {
    const result = await execute(agent, data, feedback)
    return result ? { ...data, agent_results: { ...data.agent_results, [agent]: result } } : data
  }

  const review_candidates = async (data: consumer_execution_data): Promise<consumer_execution_data> => {
    check_deadline()
    if (data.dispatcher_plan?.candidate_validation !== 'repeat_required_checks') return data
    if (!dependency.specialists?.['Bargain Hunter']) return data
    if (data.agent_results['Bargain Hunter']?.status !== 'completed') {
      return { ...data, candidate_review: skipped('Alternative candidate retrieval has not completed.') }
    }
    // TODO: the adapter must cap candidates and repeat identity, applicable specialists,
    // Skeptic, Referee and permitted Coach checks using the same use_tool / deadline.
    const candidate_review = dependency.candidate_review
      ? await invoke(
          'candidate-review',
          dependency.candidate_review,
          input_for(
            data,
            data.dispatcher_plan.selected_agents.filter((step) => data.agent_results[step.agent]?.status === 'completed').map((step) => step.agent),
          ),
        )
      : placeholder('Alternative candidate review')
    return { ...data, candidate_review }
  }

  const repair_response = async (data: consumer_execution_data): Promise<consumer_execution_data> => {
    let repaired = data
    for (let attempt = 0; repaired.agent_results.Gatekeeper?.status === 'repair_required'; attempt++) {
      check_deadline()
      if (attempt >= (budgets?.max_response_repairs ?? 0)) {
        return {
          ...repaired,
          agent_results: {
            ...repaired.agent_results,
            Gatekeeper: { status: 'error', output: null, limitations: ['The final response repair budget is exhausted.'] },
          },
        }
      }
      repaired = await run('Storyteller', repaired, repaired.agent_results.Gatekeeper)
      if (repaired.agent_results.Storyteller?.status !== 'completed') return repaired
      repaired = await run('Gatekeeper', repaired)
    }
    return repaired
  }

  const result = (data: consumer_execution_data): type_schema_agent_conductor_result => {
    check_deadline()
    const allowed = data.bodyguard.safe && data.bodyguard.action === 'allow'
    const selected_implemented = data.dispatcher_plan?.selected_agents.filter((step) => Boolean(dependency.specialists?.[step.agent])) ?? []
    const steps = selected_implemented.flatMap((step) => {
      const result = data.agent_results[step.agent]
      return result ? [{ agent: step.agent, result }] : []
    })
    const incomplete = selected_implemented.filter((step) => data.agent_results[step.agent]?.status !== 'completed')
    const candidate_pending =
      Boolean(dependency.specialists?.['Bargain Hunter']) &&
      data.dispatcher_plan?.candidate_validation === 'repeat_required_checks' &&
      data.candidate_review?.status !== 'completed'
    const gatekeeper = data.agent_results.Gatekeeper
    if (allowed && incomplete.length === 0 && !candidate_pending && gatekeeper?.status === 'completed') {
      // The Gatekeeper adapter must return the complete validated API response as output.
      const approved = schema_agent_conductor_result.parse(gatekeeper.output)
      return { ...approved, execution_id: data.execution_id }
    }

    const detective = schema_agent_detective.safeParse(data.agent_results.Detective?.output)
    const investigator = schema_agent_investigator.safeParse(data.agent_results.Investigator?.output)
    const investigator_sources = investigator.success ? collect_investigator_sources(investigator.data) : { sources: [], source_ids: [] }
    const detective_subject = detective.success && detective.data.status === 'identified' ? detective.data.subject : null
    const subject: type_schema_agent_conductor_result['subject'] = detective_subject?.name
      ? {
          type: detective_subject.type,
          name: detective_subject.name,
          barcode: detective_subject.type === 'product' ? detective_subject.barcode : null,
          brand: detective_subject.type === 'brand' ? detective_subject.name : detective_subject.brand_name,
        }
      : null
    const product =
      subject?.type === 'product'
        ? {
            barcode: subject.barcode,
            name: subject.name,
            brand: subject.brand,
          }
        : null

    let outcome: type_schema_agent_conductor_result['outcome'] = null
    if (allowed && investigator.success) outcome = investigator.data.status
    else if (allowed && detective.success && detective.data.status === 'unavailable') outcome = 'unavailable'
    else if (allowed && detective.success && detective.data.status !== 'identified') outcome = 'needs_input'
    else if (allowed && subject) outcome = 'needs_review'

    const explanation =
      subject && outcome
        ? build_temporary_explanation(subject, outcome, investigator.success ? investigator.data : null, investigator_sources.source_ids)
        : null

    const assessment_status = (status: consumer_step_result['status']) => {
      if (status === 'repair_required') return 'needs_review' as const
      if (status === 'not_implemented') return 'skipped' as const
      return status
    }
    const assessments = steps.map(({ agent, result }) => {
      const summary =
        agent === 'Detective' && detective.success
          ? detective.data.message
          : agent === 'Investigator' && investigator.success
            ? summarize_investigator(investigator.data)
            : (result.limitations[0] ?? `${agent} ${result.status}.`)
      return {
        agent,
        status: assessment_status(result.status),
        summary,
        source_ids: agent === 'Investigator' ? investigator_sources.source_ids : [],
        limitations: result.limitations,
      }
    })

    let status: type_schema_agent_conductor_result['status'] = 'needs_review'
    if (!allowed) status = data.bodyguard.action === 'human_review' ? 'needs_review' : 'blocked'
    else if (steps.some(({ result }) => result.status === 'blocked')) status = 'blocked'
    else if (steps.some(({ result }) => result.status === 'error')) status = 'error'
    else if (steps.some(({ result }) => result.status === 'needs_input')) status = 'needs_input'
    else if (steps.some(({ result }) => result.status === 'needs_review' || result.status === 'repair_required')) status = 'needs_review'
    else if (selected_implemented.length === 0) status = 'partial'
    else if (incomplete.length > 0 || candidate_pending) status = 'needs_review'
    else status = 'completed'

    return {
      execution_id: data.execution_id,
      status,
      subject,
      outcome,
      product,
      assessments,
      alternatives: [],
      explanation,
      sources: investigator_sources.sources,
      limitations: !allowed
        ? ['The request did not pass the entry policy. No further agents were executed.']
        : [
            ...(selected_implemented.length === 0 ? ['No implemented specialist was selected for this request.'] : []),
            ...new Set(steps.flatMap(({ result }) => result.limitations)),
            ...(data.candidate_review?.limitations ?? []),
            ...(incomplete.length ? [`Unresolved implemented agents: ${incomplete.map((step) => step.agent).join(', ')}.`] : []),
          ],
      steps: [],
    }
  }

  return { initialize, parallel, run, review_candidates, repair_response, result }
}
