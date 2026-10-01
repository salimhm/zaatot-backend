import type { type_schema_agent_dispatcher } from '@agent/dispatcher/dispatcher.schema.agent'
import type { consumer_event_reporter, consumer_execution_dependency, consumer_specialist_name } from '@ai/execution/execution-contract.ai'
import type { ai_tool_activity } from '@ai/runtime.ai'

import { run_workflow_step } from '@ai/runtime.ai'

type budgets = type_schema_agent_dispatcher['budgets']

// Per-request limits shared by every specialist, parallel branch, retry and repair:
// the deadline and cancellation signal, the tool-call budget, and Bait Tester inspection.
export const create_execution_runtime = (options: {
  parent_signal: AbortSignal
  deadline_ms: number
  report_event: consumer_event_reporter
  bait_tester: consumer_execution_dependency['bait_tester']
}) => {
  const { parent_signal, deadline_ms, report_event } = options
  let signal = parent_signal
  let execution_deadline = deadline_ms
  let tool_calls = 0
  let budget_exhausted = false
  let budgets: budgets | null = null
  let execution_id = ''

  const check_deadline = () => {
    signal.throwIfAborted()
    if (performance.now() >= execution_deadline) throw new DOMException('Workflow deadline exceeded', 'TimeoutError')
  }

  // Applies the Dispatcher budgets once specialist execution starts.
  const start = (id: string, plan_budgets: budgets | null) => {
    check_deadline()
    execution_id = id
    budgets = plan_budgets ? { ...plan_budgets } : null
    if (budgets) {
      execution_deadline = Math.min(deadline_ms, performance.now() + budgets.timeout_ms)
      const remaining_ms = Math.floor(execution_deadline - performance.now())
      if (remaining_ms <= 0) throw new DOMException('Workflow deadline exceeded', 'TimeoutError')
      signal = AbortSignal.any([parent_signal, AbortSignal.timeout(remaining_ms)])
    }
  }

  // Snapshot of what remains for one adapter call; not an independent allowance.
  const remaining_budgets = (): budgets => {
    if (!budgets) throw new Error('Specialist execution requires a Dispatcher plan')
    return {
      ...budgets,
      timeout_ms: Math.max(0, Math.floor(execution_deadline - performance.now())),
      max_tool_calls: Math.max(0, budgets.max_tool_calls - tool_calls),
    }
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
    if (!options.bait_tester) throw new Error('Bait Tester is not implemented; external text cannot be consumed')
    const inspect = options.bait_tester
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

  return {
    get signal() {
      return signal
    },
    get budgets() {
      return budgets
    },
    get budget_exhausted() {
      return budget_exhausted
    },
    check_deadline,
    start,
    remaining_budgets,
    use_tool,
    inspect_content,
  }
}

export type execution_runtime = ReturnType<typeof create_execution_runtime>
