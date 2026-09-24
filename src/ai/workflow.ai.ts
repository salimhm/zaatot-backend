import type { type_schema_agent_conductor_input, type_schema_agent_conductor_result } from '@agent/conductor/conductor.schema.agent'
import type { type_schema_agent_dispatcher_input } from '@agent/dispatcher/dispatcher.schema.agent'
import type { consumer_execution_data, consumer_execution_dependency } from '@ai/execution.ai'

import { andThen, createWorkflowChain } from '@voltagent/core'

import { create_consumer_execution, merge_consumer_parallel } from '@ai/execution.ai'
import { inspect_external_content } from '@agent/bait-tester/bait-tester.agent'
import { agent_bodyguard } from '@agent/bodyguard/bodyguard.agent'
import { SecurityDecision } from '@agent/bodyguard/bodyguard.schema.agent'
import { agent_conductor } from '@agent/conductor/conductor.agent'
import { schema_agent_conductor, schema_agent_conductor_input, schema_agent_conductor_plan } from '@agent/conductor/conductor.schema.agent'
import { agent_detective } from '@agent/detective/detective.agent'
import { schema_agent_detective } from '@agent/detective/detective.schema.agent'
import { dispatcher_budget_limit } from '@agent/dispatcher/constants'
import { agent_dispatcher } from '@agent/dispatcher/dispatcher.agent'
import { schema_agent_dispatcher } from '@agent/dispatcher/dispatcher.schema.agent'
import { agent_investigator } from '@agent/investigator/investigator.agent'
import { schema_agent_investigator } from '@agent/investigator/investigator.schema.agent'

export type consumer_dependency = consumer_execution_dependency & {
  bodyguard: (prompt: string, signal: AbortSignal) => Promise<unknown>
  conductor: (prompt: string, signal: AbortSignal) => Promise<unknown>
  dispatcher: (input: type_schema_agent_dispatcher_input, signal: AbortSignal) => Promise<unknown>
}

const default_dependency: consumer_dependency = {
  bodyguard: async (prompt, signal) => {
    const result = await agent_bodyguard(prompt, signal)
    if (!result.success) throw new Error('Bodyguard assessment failed', { cause: result.data })
    return result.data
  },
  conductor: async (prompt, signal) => {
    const result = await agent_conductor(prompt, signal)
    if (!result.success) throw new Error('Conductor planning failed', { cause: result.data })
    return result.data
  },
  dispatcher: async (input, signal) => {
    const result = await agent_dispatcher(input, signal)
    if (!result.success) throw new Error('Dispatcher planning failed', { cause: result.data })
    return result.data
  },
  // Replace each null with an adapter: async (input, signal) => ({ status, output, limitations }).
  // Validate the real agent's output in the adapter. See docs/workflow-placeholders.md.
  specialists: {
    Detective: async (input, signal) => {
      const result = await agent_detective(input.prompt, signal, {
        use_tool: input.use_tool,
        inspect_content: input.inspect_content,
      })
      if (!result.success) throw new Error('Detective lookup failed', { cause: result.data })


      const output = schema_agent_product_brand_lookup.parse(result.data)
      const resolved = output.found && output.query_type !== 'unknown'
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
    },
    'Vault Keeper': null, // TODO: agent_vault_keeper — consent and permitted context.
    Medic: null, // TODO: agent_medic — ingredient / clinical checks.
    Investigator: async (input, signal) => {
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
    },
    'Eco Scout': null, // TODO: agent_eco_scout — environmental evidence.
    Historian: null, // TODO: agent_historian — permitted history only.
    Skeptic: null, // TODO: agent_skeptic — evidence review.
    Referee: null, // TODO: agent_referee — hard constraints.
    Coach: null, // TODO: agent_coach — permitted goal fit.
    'Bargain Hunter': null, // TODO: agent_bargain_hunter — alternative candidates.
    Storyteller: null, // TODO: agent_storyteller — draft / repair the explanation.
    Gatekeeper: null, // TODO: agent_gatekeeper — output the validated final API response.
  },
  candidate_review: null, // TODO: bounded candidate identity / specialist / evidence / constraint review.
  bait_tester: inspect_external_content,
}

const describe_workflow_failure = (error: unknown, signal: AbortSignal) => {
  let step = 'unknown'
  let provider_status: number | undefined
  let invalid_api_key = false
  let timed_out = false
  let cause = error

  for (let depth = 0; depth < 8 && cause && typeof cause === 'object'; depth++) {
    const detail = cause as { name?: unknown; message?: unknown; statusCode?: unknown; cause?: unknown }
    const message = typeof detail.message === 'string' ? detail.message : ''
    if (message === 'Bodyguard assessment failed') step = 'bodyguard'
    if (message === 'Conductor planning failed') step = 'conductor-plan'
    if (message === 'Dispatcher planning failed') step = 'dispatcher-plan'
    if (detail.name === 'TimeoutError') timed_out = true
    if (typeof detail.statusCode === 'number') provider_status = detail.statusCode
    if (/API key not valid|API_KEY_INVALID/i.test(message)) invalid_api_key = true
    cause = detail.cause
  }

  let code = 'workflow_startup_failed'
  let limitation = 'Workflow startup could not complete. No analysis result is available.'
  if (signal.aborted || timed_out) {
    if (signal.aborted) timed_out = signal.reason instanceof Error && signal.reason.name === 'TimeoutError'
    code = timed_out ? 'workflow_timeout' : 'workflow_cancelled'
    limitation = timed_out ? 'Workflow startup exceeded its time limit. No analysis result is available.' : 'Workflow execution was cancelled.'
  } else if (invalid_api_key || provider_status === 401) {
    code = 'provider_authentication_failed'
    limitation = 'The AI provider rejected the server API key. Check GOOGLE_GENERATIVE_AI_API_KEY in the server environment.'
  } else if (provider_status === 403) {
    code = 'provider_access_denied'
    limitation = 'The AI provider denied access. Check the server API key permissions and model access.'
  } else if (provider_status === 429) {
    code = 'provider_quota_exceeded'
    limitation = 'The AI provider quota or rate limit was exceeded. Check the provider quota before retrying.'
  } else if (provider_status === 404) {
    code = 'provider_model_unavailable'
    limitation = 'The configured AI model was not found. Check AI_BODYGUARD_MODEL, AI_CONDUCTOR_MODEL and AI_DISPATCHER_MODEL.'
  }

  return { step, provider_status, code, limitation }
}

export const create_consumer_workflow = (dependency: consumer_dependency, signal: AbortSignal, deadline_ms: number) => {
  const execution = create_consumer_execution(dependency, signal, deadline_ms)
  return (
    createWorkflowChain({
      id: 'consumer_product_analysis',
      name: 'Consumer product analysis',
      input: schema_agent_conductor_input,
      result: schema_agent_conductor,
    })
      .andThen({
        id: 'conductor-initialize',
        execute: async ({ data, state }) => {
          signal.throwIfAborted()
          return { ...data, execution_id: state.executionId }
        },
      })
      .andThen({
        id: 'bodyguard',
        execute: async ({ data }) => {
          signal.throwIfAborted()
          const bodyguard = SecurityDecision.parse(await dependency.bodyguard(data.prompt, signal))
          signal.throwIfAborted()
          return { ...data, bodyguard }
        },
      })
      .andThen({
        id: 'conductor-plan',
        execute: async ({ data }) => {
          signal.throwIfAborted()
          if (!data.bodyguard.safe || data.bodyguard.action !== 'allow') {
            return { ...data, plan: null }
          }
          const plan = schema_agent_conductor_plan.parse(await dependency.conductor(data.prompt, signal))
          signal.throwIfAborted()
          return { ...data, plan }
        },
      })
      .andThen({
        id: 'dispatcher-plan',
        execute: async ({ data }) => {
          signal.throwIfAborted()
          if (!data.bodyguard.safe || data.bodyguard.action !== 'allow' || !data.plan) {
            return { ...data, dispatcher_plan: null }
          }
          const remaining_ms = Math.floor(deadline_ms - performance.now())
          if (remaining_ms <= 0) throw new DOMException('Workflow deadline exceeded', 'TimeoutError')
          const dispatcher_plan = schema_agent_dispatcher.parse(
            await dependency.dispatcher(
              {
                prompt: data.prompt,
                bodyguard: data.bodyguard,
                conductor_plan: data.plan,
                budget_limits: { ...dispatcher_budget_limit, timeout_ms: Math.min(remaining_ms, dispatcher_budget_limit.timeout_ms) },
              },
              signal,
            ),
          )
          signal.throwIfAborted()
          return { ...data, dispatcher_plan }
        },
      })
      // All later stages are wired. Null specialist adapters record placeholders, never findings.
      .andThen({
        id: 'specialists-initialize',
        execute: async ({ data }) => execution.initialize(data),
      })
      .andAll({
        id: 'product-and-personal-context',
        steps: [
          andThen({
            id: 'detective',
            execute: async ({ data }: { data: consumer_execution_data }) => execution.parallel('Detective', data),
          }),
          andThen({
            id: 'vault-keeper',
            execute: async ({ data }: { data: consumer_execution_data }) => execution.parallel('Vault Keeper', data),
          }),
        ],
      })
      .andThen({
        id: 'merge-product-and-context',
        execute: async ({ data }) => merge_consumer_parallel(data),
      })
      .andAll({
        id: 'specialist-checks',
        steps: [
          andThen({
            id: 'medic',
            execute: async ({ data }: { data: consumer_execution_data }) => execution.parallel('Medic', data),
          }),
          andThen({
            id: 'investigator',
            execute: async ({ data }: { data: consumer_execution_data }) => execution.parallel('Investigator', data),
          }),
          andThen({
            id: 'eco-scout',
            execute: async ({ data }: { data: consumer_execution_data }) => execution.parallel('Eco Scout', data),
          }),
          andThen({
            id: 'historian',
            execute: async ({ data }: { data: consumer_execution_data }) => execution.parallel('Historian', data),
          }),
        ],
      })
      .andThen({
        id: 'merge-specialist-checks',
        execute: async ({ data }) => merge_consumer_parallel(data),
      })
      .andThen({ id: 'skeptic', execute: async ({ data }) => execution.run('Skeptic', data) })
      .andThen({ id: 'referee', execute: async ({ data }) => execution.run('Referee', data) })
      .andThen({ id: 'coach', execute: async ({ data }) => execution.run('Coach', data) })
      .andThen({ id: 'bargain-hunter', execute: async ({ data }) => execution.run('Bargain Hunter', data) })
      .andThen({ id: 'candidate-review', execute: async ({ data }) => execution.review_candidates(data) })
      .andThen({ id: 'storyteller', execute: async ({ data }) => execution.run('Storyteller', data) })
      .andThen({ id: 'gatekeeper', execute: async ({ data }) => execution.run('Gatekeeper', data) })
      .andThen({ id: 'response-repair', execute: async ({ data }) => execution.repair_response(data) })
      .andThen({
        id: 'conductor-result',
        execute: async ({ data }) => execution.result(data),
      })
  )
}

export const run_consumer_workflow = async (
  input: type_schema_agent_conductor_input,
  options: { signal?: AbortSignal; dependency?: consumer_dependency; timeout_ms?: number } = {},
): Promise<type_schema_agent_conductor_result> => {
  const data = schema_agent_conductor_input.parse(input)
  const execution_id = crypto.randomUUID()
  const timeout_ms = options.timeout_ms ?? 240_000
  const deadline_ms = performance.now() + timeout_ms
  const timeout = AbortSignal.timeout(timeout_ms)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  const workflow = create_consumer_workflow(options.dependency ?? default_dependency, signal, deadline_ms)
  const execution = await workflow.run(data, { executionId: execution_id, userId: String(data.user_id) })

  if (execution.status === 'completed' && execution.result) {
    return schema_agent_conductor.parse(execution.result)
  }

  const failure = describe_workflow_failure(execution.error, signal)
  console.error('[ai.workflow.failed]', {
    execution_id,
    step: failure.step,
    code: failure.code,
    provider_status: failure.provider_status,
  })

  return {
    execution_id,
    status: 'error',
    product: null,
    assessments: [],
    alternatives: [],
    explanation: null,
    sources: [],
    limitations: [failure.limitation],
  }
}
