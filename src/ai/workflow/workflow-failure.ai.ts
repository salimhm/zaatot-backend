import { WorkflowStepError } from '@ai/runtime.ai'

// Classifies an escaped workflow error into a safe, user-facing limitation without provider details.
export const describe_workflow_failure = (error: unknown, signal: AbortSignal) => {
  let step = 'unknown'
  let provider_status: number | undefined
  let invalid_api_key = false
  let timed_out = false
  const pending_errors: unknown[] = [error]
  const inspected_errors = new Set<unknown>()

  // The AI SDK wraps an exhausted retry budget in RetryError. Inspecting its
  // lastError/errors keeps provider status classification accurate after retries.
  while (pending_errors.length > 0 && inspected_errors.size < 32) {
    const cause = pending_errors.pop()
    if (!cause || typeof cause !== 'object' || inspected_errors.has(cause)) continue
    inspected_errors.add(cause)

    if (cause instanceof WorkflowStepError) step = cause.workflow_step
    const detail = cause as {
      name?: unknown
      message?: unknown
      statusCode?: unknown
      cause?: unknown
      lastError?: unknown
      errors?: unknown
    }
    const message = typeof detail.message === 'string' ? detail.message : ''
    if (message === 'Bodyguard assessment failed') step = 'bodyguard'
    if (message === 'Conductor planning failed') step = 'conductor-plan'
    if (message === 'Dispatcher planning failed') step = 'dispatcher-plan'
    if (detail.name === 'TimeoutError') timed_out = true
    if (typeof detail.statusCode === 'number') provider_status = detail.statusCode
    if (/API key not valid|API_KEY_INVALID/i.test(message)) invalid_api_key = true

    pending_errors.push(detail.cause, detail.lastError)
    if (Array.isArray(detail.errors)) pending_errors.push(...detail.errors)
  }

  let code = 'workflow_startup_failed'
  let limitation = 'Workflow startup could not complete. No analysis result is available.'
  if (signal.aborted || timed_out) {
    if (signal.aborted) timed_out = signal.reason instanceof Error && signal.reason.name === 'TimeoutError'
    code = timed_out ? 'workflow_timeout' : 'workflow_cancelled'
    limitation = timed_out
      ? `Workflow exceeded its time limit${step === 'unknown' ? '' : ` during ${step}`}. No validated analysis result is available.`
      : 'Workflow execution was cancelled.'
  } else if (invalid_api_key || provider_status === 401) {
    code = 'provider_authentication_failed'
    limitation = 'The AI provider rejected the server API key. Check GOOGLE_GENERATIVE_AI_API_KEY in the server environment.'
  } else if (provider_status === 403) {
    code = 'provider_access_denied'
    limitation = 'The AI provider denied access. Check the server API key permissions and model access.'
  } else if (provider_status === 429) {
    code = 'provider_quota_exceeded'
    limitation = 'The AI provider quota or rate limit was exceeded. Check the provider quota before retrying.'
  } else if (provider_status === 503) {
    code = 'provider_temporarily_unavailable'
    limitation = 'The AI provider is temporarily unavailable after retrying the request. Try again shortly.'
  } else if (provider_status === 404) {
    code = 'provider_model_unavailable'
    limitation = 'The configured AI model was not found. Check AI_BODYGUARD_MODEL, AI_CONDUCTOR_MODEL and AI_DISPATCHER_MODEL.'
  }

  return { step, provider_status, code, limitation }
}
