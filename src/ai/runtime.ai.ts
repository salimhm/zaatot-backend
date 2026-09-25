// The workflow owns the deadline; the HTTP connection gets five seconds to return its result.
export const ai_workflow_timeout_ms = Number(process.env.AI_WORKFLOW_TIMEOUT_MS || 240_000)
if (!Number.isInteger(ai_workflow_timeout_ms) || ai_workflow_timeout_ms < 1 || ai_workflow_timeout_ms > 240_000) {
  throw new Error('AI_WORKFLOW_TIMEOUT_MS must be an integer between 1 and 240000 milliseconds')
}
export const ai_request_timeout_seconds = Math.ceil(ai_workflow_timeout_ms / 1000) + 5

export type ai_tool_activity = {
  name: string
  title: string
  detail?: string
}

export class WorkflowStepError extends Error {
  constructor(
    readonly workflow_step: string,
    cause: unknown,
  ) {
    super(`Workflow step ${workflow_step} failed`, { cause })
    this.name = 'WorkflowStepError'
  }
}

// Passing a signal alone is not enough: database adapters may ignore it. Stop waiting
// at the deadline, discard late results, and still pass the signal to cancellable I/O.
export const run_workflow_step = async <T>(execution_id: string, step: string, signal: AbortSignal, execute: () => Promise<T>): Promise<T> => {
  const started_at = performance.now()
  let on_abort: (() => void) | undefined
  console.info('[ai.workflow.step]', { execution_id, step, status: 'started' })
  try {
    signal.throwIfAborted()
    const cancelled = new Promise<never>((_resolve, reject) => {
      on_abort = () => reject(signal.reason)
      signal.addEventListener('abort', on_abort, { once: true })
    })
    const result = await Promise.race([cancelled, execute()])
    signal.throwIfAborted()
    console.info('[ai.workflow.step]', { execution_id, step, status: 'completed', duration_ms: Math.round(performance.now() - started_at) })
    return result
  } catch (cause) {
    console.info('[ai.workflow.step]', { execution_id, step, status: 'failed', duration_ms: Math.round(performance.now() - started_at) })
    throw new WorkflowStepError(step, cause)
  } finally {
    if (on_abort) signal.removeEventListener('abort', on_abort)
  }
}
