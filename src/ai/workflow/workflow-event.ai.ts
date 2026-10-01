import type { type_ai_workflow_step } from '@agent/conductor/conductor.schema.agent'
import type { consumer_event_reporter } from '@ai/execution/execution-contract.ai'

import { run_workflow_step } from '@ai/runtime.ai'
import { schema_ai_workflow_step } from '@agent/conductor/conductor.schema.agent'

// Collects the validated, numbered step events of one execution and forwards each to on_step.
export const create_workflow_event_reporter = (execution_id: string, on_step?: (event: type_ai_workflow_step) => void) => {
  const steps: type_ai_workflow_step[] = []
  let sequence = 0
  const report_event: consumer_event_reporter = (input_event) => {
    const event = schema_ai_workflow_step.parse({
      ...input_event,
      sequence: ++sequence,
      execution_id,
      timestamp: new Date().toISOString(),
    })
    steps.push(event)
    try {
      on_step?.(event)
    } catch {
      // Event consumers must never be able to interrupt the analysis workflow.
    }
  }
  return { steps, report_event }
}

// Runs one planning agent as a workflow step and reports its started/completed/failed events.
export const run_reported_agent = async <T>(options: {
  execution_id: string
  workflow_step: string
  agent: NonNullable<type_ai_workflow_step['agent']>
  title: string
  detail?: string
  signal: AbortSignal
  report_event: consumer_event_reporter
  execute: () => Promise<T>
  completed: (result: T) => { title: string; detail?: string; status?: type_ai_workflow_step['status'] }
}): Promise<T> => {
  const step_id = crypto.randomUUID()
  const started_at = performance.now()
  options.report_event({
    step_id,
    type: 'agent.started',
    agent: options.agent,
    status: 'running',
    title: options.title,
    detail: options.detail ?? null,
    metadata: { tool: null, duration_ms: null },
  })
  try {
    const result = await run_workflow_step(options.execution_id, options.workflow_step, options.signal, options.execute)
    const completed = options.completed(result)
    options.report_event({
      step_id,
      type: 'agent.completed',
      agent: options.agent,
      status: completed.status ?? 'completed',
      title: completed.title,
      detail: completed.detail ?? null,
      metadata: { tool: null, duration_ms: Math.round(performance.now() - started_at) },
    })
    return result
  } catch (error) {
    options.report_event({
      step_id,
      type: 'agent.failed',
      agent: options.agent,
      status: 'error',
      title: `${options.agent} failed`,
      detail: 'This workflow stage could not be completed.',
      metadata: { tool: null, duration_ms: Math.round(performance.now() - started_at) },
    })
    throw error
  }
}
