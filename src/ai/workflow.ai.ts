import type {
  type_ai_workflow_step,
  type_schema_agent_conductor_input,
  type_schema_agent_conductor_result,
} from '@agent/conductor/conductor.schema.agent'
import type { type_schema_agent_dispatcher_input } from '@agent/dispatcher/dispatcher.schema.agent'
import type {
  consumer_backend_context,
  consumer_event_reporter,
  consumer_execution_data,
  consumer_execution_dependency,
  consumer_specialist_input,
} from '@ai/execution.ai'
import type { lib_dto_payload } from '@lib/dto.lib'

import { andThen, createWorkflowChain } from '@voltagent/core'

import { create_consumer_execution, merge_consumer_parallel } from '@ai/execution.ai'
import { ai_workflow_timeout_ms, run_workflow_step, WorkflowStepError } from '@ai/runtime.ai'
import { inspect_external_content } from '@agent/bait-tester/bait-tester.agent'
import { agent_bodyguard } from '@agent/bodyguard/bodyguard.agent'
import { SecurityDecision } from '@agent/bodyguard/bodyguard.schema.agent'
import { agent_conductor } from '@agent/conductor/conductor.agent'
import {
  schema_agent_conductor,
  schema_agent_conductor_input,
  schema_agent_conductor_plan,
  schema_ai_workflow_step,
} from '@agent/conductor/conductor.schema.agent'
import { agent_detective } from '@agent/detective/detective.agent'
import { schema_agent_detective } from '@agent/detective/detective.schema.agent'
import { dispatcher_budget_limit } from '@agent/dispatcher/constants'
import { agent_dispatcher } from '@agent/dispatcher/dispatcher.agent'
import { normalize_dispatcher_plan, schema_agent_dispatcher, schema_agent_dispatcher_draft } from '@agent/dispatcher/dispatcher.schema.agent'
import { agent_investigator } from '@agent/investigator/investigator.agent'
import { schema_agent_investigator } from '@agent/investigator/investigator.schema.agent'
import { schema_agent_medic, schema_agent_medic_workflow_input } from '@agent/medic/medic.schema.agent'
import { dto_tool_medic_nutrition_assessor } from '@tool/medic-nutrition-assessor/medic-nutrition-assessor.dto.tool'
import { tool_medic_nutrition_assessor } from '@tool/medic-nutrition-assessor/medic-nutrition-assessor.tool'
import { dto_tool_medic_portion_calculator } from '@tool/medic-portion-calculator/medic-portion-calculator.dto.tool'
import { extract_requested_medic_portion, tool_medic_portion_calculator } from '@tool/medic-portion-calculator/medic-portion-calculator.tool'
import {
  create_medic_restriction_checker_tool,
  medic_missing_product_assessment,
  medic_missing_profile_assessment,
  medic_no_restrictions_assessment,
} from '@tool/medic-restriction-checker/medic-restriction-checker.tool'
import { dto_tool_vault_keeper_context, schema_tool_vault_keeper_context_profile } from '@tool/vault-keeper/vault-keeper-context.dto.tool'
import { create_vault_keeper_context_tool } from '@tool/vault-keeper/vault-keeper-context.tool'

import { lib_error } from '@lib/error.lib'

export type consumer_dependency = consumer_execution_dependency & {
  bodyguard: (prompt: string, signal: AbortSignal) => Promise<unknown>
  conductor: (prompt: string, signal: AbortSignal) => Promise<unknown>
  dispatcher: (input: type_schema_agent_dispatcher_input, signal: AbortSignal) => Promise<unknown>
}

export const adapter_vault_keeper = async (input: consumer_specialist_input, signal: AbortSignal, backend_context?: consumer_backend_context) => {
  if (!backend_context) {
    const missing_information = ['Verified authentication context is required to retrieve private product-fit context.']
    return {
      status: 'blocked' as const,
      output: { profile: null, missing_information },
      permissions: { personalization: false, history: false },
      limitations: missing_information,
    }
  }

  const tool = create_vault_keeper_context_tool(backend_context, { use_tool: input.use_tool })
  const context = dto_tool_vault_keeper_context.result.parse(
    await tool.execute!({ personalization: true, history: true }, { toolContext: { abortSignal: signal } as never }),
  )
  const missing_information = [
    ...(context.permissions.personalization ? [] : ['A consented product-fit profile is unavailable for this request.']),
    ...(context.permissions.history ? [] : ['Permission to use product-fit history is unavailable for this request.']),
  ]

  return {
    status: 'completed' as const,
    output: { profile: context.profile, missing_information },
    permissions: context.permissions,
    limitations: missing_information,
  }
}

const unique_strings = (values: readonly string[]) => [...new Set(values)]

export const adapter_medic = async (input: consumer_specialist_input, signal: AbortSignal) => {
  signal.throwIfAborted()
  const medic_checks = input.medic_checks ?? []
  if (medic_checks.length === 0) {
    const output = schema_agent_medic.parse({
      status: 'insufficient_data',
      mode: 'generic',
      summary: 'Medic did not receive an explicit check scope from Dispatcher.',
      checked_scope: [],
      risk_flags: [],
      required_restrictions: [],
      missing_information: ['Dispatcher medic_checks scope'],
      limitations: ['Medic did not run because its selected deterministic checks were not provided by the workflow plan.'],
    })
    return { status: 'needs_review' as const, output, limitations: output.limitations }
  }

  const detective = schema_agent_detective.safeParse(input.dependencies.Detective?.output)
  if (!detective.success || detective.data.status !== 'identified' || !detective.data.subject) {
    const output = medic_missing_product_assessment()
    return { status: 'needs_input' as const, output, limitations: output.limitations }
  }

  const subject = detective.data.subject
  if (subject.type !== 'product' || !subject.barcode) {
    const output = medic_missing_product_assessment()
    return { status: 'needs_input' as const, output, limitations: output.limitations }
  }

  const exact_product = detective.data.related_products.items.find((product) => product.barcode === subject.barcode)
  const product = exact_product ?? {
    source: subject.source,
    product_id: null,
    barcode: subject.barcode,
    type: null,
    name: subject.name,
    brand_name: subject.brand_name,
    brand_candidates: subject.brand_candidates,
    images: [],
    nova_group: null,
    ecoscore: null,
    nutriscore: null,
    ingredients: null,
    allergens: null,
    nutrition: null,
  }

  const vault = input.dependencies['Vault Keeper']
  const vault_output = vault?.output
  const released_profile =
    vault?.permissions?.personalization === true && vault_output && typeof vault_output === 'object' && 'profile' in vault_output
      ? schema_tool_vault_keeper_context_profile.safeParse(vault_output.profile)
      : null
  const profile = released_profile?.success && released_profile.data !== null ? released_profile.data : null
  const vault_missing_information =
    profile === null ? unique_strings([...(vault?.limitations ?? []), 'No permitted personal product-fit context was released by Vault Keeper.']) : []

  const context = schema_agent_medic_workflow_input.parse({
    request: input.prompt,
    detective: {
      product,
      sources_checked: detective.data.sources_checked,
    },
    vault_keeper: {
      personalization_permitted: profile !== null,
      profile,
      missing_information: vault_missing_information,
    },
  })

  const barcode = context.detective.product.barcode
  if (!barcode) {
    const output = medic_missing_product_assessment()
    return { status: 'needs_input' as const, output, limitations: output.limitations }
  }

  const has_check = (check: (typeof medic_checks)[number]) => medic_checks.includes(check)

  const nutrition_assessment = has_check('nutrition_assessment')
    ? dto_tool_medic_nutrition_assessor.assessment.parse(
        await input.use_tool(
          async () => await tool_medic_nutrition_assessor.execute!({ barcode }, { toolContext: { abortSignal: signal } } as never),
          {
            name: 'tool_medic_nutrition_assessor',
            title: 'Assessing verified nutrition label',
            detail: 'Applying the fixed nutrition-label profile to the exact product variant.',
          },
        ),
      )
    : undefined

  const requested_portion = has_check('portion_calculation') ? extract_requested_medic_portion(context.request) : null
  const portion_calculation =
    requested_portion === null
      ? undefined
      : dto_tool_medic_portion_calculator.calculation.parse(
          await input.use_tool(
            async () =>
              await tool_medic_portion_calculator.execute!({ barcode, portion: requested_portion }, {
                toolContext: { abortSignal: signal },
              } as never),
            {
              name: 'tool_medic_portion_calculator',
              title: 'Calculating verified nutrient quantities',
              detail: 'Scaling verified nutrition facts for ' + requested_portion.value + ' ' + requested_portion.unit + '.',
            },
          ),
        )
  const portion_missing_information =
    has_check('portion_calculation') && requested_portion === null
      ? ['One explicit amount and unit are required for the requested portion calculation.']
      : []
  const portion_limitations =
    has_check('portion_calculation') && requested_portion === null
      ? ['Medic does not infer a portion when the request contains zero or multiple amounts.']
      : []

  const restriction_assessment = !has_check('restriction_check')
    ? undefined
    : profile === null
      ? medic_missing_profile_assessment()
      : profile.allergens.length === 0 && profile.avoided_ingredients.length === 0
        ? medic_no_restrictions_assessment()
        : schema_agent_medic.parse(
            await input.use_tool(
              async () =>
                await create_medic_restriction_checker_tool(profile).execute!({ barcode }, { toolContext: { abortSignal: signal } } as never),
              {
                name: 'tool_medic_restriction_checker',
                title: 'Checking verified allergens and ingredients',
                detail: 'Comparing the exact product variant with permitted restrictions.',
              },
            ),
          )

  signal.throwIfAborted()

  const nutrition_flags = (nutrition_assessment?.findings ?? [])
    .filter((finding) => finding.level === 'high')
    .map((finding) => ({
      kind: 'clinical_rule' as const,
      summary: `General nutrition-label concern: verified ${finding.label.toLocaleLowerCase('en-US')} is high under the ${nutrition_assessment!.ruleset.name}.`,
      product_fact: `The exact product records ${finding.source_measurement.value} ${finding.source_measurement.unit} of ${finding.label.toLocaleLowerCase('en-US')} ${finding.source_measurement.basis.replace('_', ' ')}.`,
      restriction: null,
      evidence_refs: [`nutrition_assessment.${finding.evidence_ref}`, 'nutrition_assessment.ruleset.reference_url'],
      rule_id: finding.rule_id,
    }))
  const restriction_flags = restriction_assessment?.risk_flags ?? []
  const risk_flags = [...nutrition_flags, ...restriction_flags]
  const checked_scope = unique_strings([
    ...(nutrition_assessment?.status === 'assessed'
      ? ['General nutrition-label screen completed for verified total fat, saturated fat, total sugars, and salt.']
      : nutrition_assessment?.status === 'partial'
        ? ['Partial general nutrition-label screen completed with the available verified nutrient facts.']
        : []),
    ...(portion_calculation?.status === 'calculated' ? ['Verified nutrient measurements scaled for the requested exact-product portion.'] : []),
    ...(restriction_assessment?.checked_scope ?? []),
  ])
  const missing_information = unique_strings([
    ...(nutrition_assessment?.status === 'assessed' ? [] : (nutrition_assessment?.missing_information ?? [])),
    ...(portion_calculation?.missing_information ?? []),
    ...portion_missing_information,
    ...(restriction_assessment?.missing_information ?? []),
  ])
  const limitations = unique_strings([
    ...(nutrition_assessment?.limitations ?? []),
    ...(portion_calculation?.limitations ?? []),
    ...portion_limitations,
    ...(restriction_assessment?.limitations ?? []),
  ])
  const required_restrictions = unique_strings([
    ...(restriction_assessment?.required_restrictions ?? []),
    ...nutrition_flags.map((flag) => `Preserve the general nutrition concern supported by ${flag.rule_id}.`),
  ])
  const status = risk_flags.length > 0 ? 'flags_found' : missing_information.length > 0 ? 'insufficient_data' : 'no_flags_detected'
  const summary =
    risk_flags.length > 0
      ? `The requested Medic checks found ${risk_flags.length} supported concern${risk_flags.length === 1 ? '' : 's'} for the exact product variant.`
      : missing_information.length > 0
        ? 'The requested Medic checks are incomplete because required product facts, permitted context, or a precise portion are unavailable.'
        : 'No supported concern was found within the completed requested Medic checks for the exact product variant.'

  const output = schema_agent_medic.parse({
    status,
    mode: profile === null ? 'generic' : 'personalized',
    summary,
    checked_scope,
    risk_flags,
    required_restrictions,
    missing_information,
    limitations,
    ...(nutrition_assessment ? { nutrition_assessment } : {}),
    ...(portion_calculation ? { portion_calculation } : {}),
  })

  return {
    status: output.status === 'insufficient_data' ? ('needs_input' as const) : ('completed' as const),
    output,
    limitations: output.limitations,
  }
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

      const output = schema_agent_detective.parse(result.data)
      const resolved = output.status === 'identified' && output.subject !== null
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
    'Vault Keeper': adapter_vault_keeper,
    Medic: adapter_medic,
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

const run_reported_agent = async <T>(options: {
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

export const create_consumer_workflow = (
  dependency: consumer_dependency,
  signal: AbortSignal,
  deadline_ms: number,
  report_event: consumer_event_reporter = () => undefined,
  authenticated_payload?: lib_dto_payload,
) => {
  const execution = create_consumer_execution(dependency, signal, deadline_ms, report_event, authenticated_payload)
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
          const bodyguard = await run_reported_agent({
            execution_id: data.execution_id,
            workflow_step: 'bodyguard',
            agent: 'Bodyguard',
            title: 'Checking request safety',
            detail: 'Applying the entry policy before product lookup.',
            signal,
            report_event,
            execute: async () => SecurityDecision.parse(await dependency.bodyguard(data.prompt, signal)),
            completed: (result) => ({
              title: result.safe && result.action === 'allow' ? 'Request approved' : 'Request stopped by policy',
              detail: result.reason,
              status: result.safe && result.action === 'allow' ? 'completed' : result.action === 'human_review' ? 'needs_review' : 'blocked',
            }),
          })
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
          const plan = await run_reported_agent({
            execution_id: data.execution_id,
            workflow_step: 'conductor-plan',
            agent: 'Conductor',
            title: 'Understanding the request',
            detail: 'Extracting the requested product analysis intent.',
            signal,
            report_event,
            execute: async () => schema_agent_conductor_plan.parse(await dependency.conductor(data.prompt, signal)),
            completed: (result) => ({ title: 'Request understood', detail: result.intent }),
          })
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
          const dispatcher_plan = await run_reported_agent({
            execution_id: data.execution_id,
            workflow_step: 'dispatcher-plan',
            agent: 'Dispatcher',
            title: 'Planning agent work',
            detail: 'Selecting the required implemented agents and execution budget.',
            signal,
            report_event,
            execute: async () =>
              schema_agent_dispatcher.parse(
                normalize_dispatcher_plan(
                  schema_agent_dispatcher_draft.parse(
                    await dependency.dispatcher(
                      {
                        prompt: data.prompt,
                        bodyguard: data.bodyguard,
                        conductor_plan: data.plan,
                        budget_limits: { ...dispatcher_budget_limit, timeout_ms: Math.min(remaining_ms, dispatcher_budget_limit.timeout_ms) },
                      },
                      signal,
                    ),
                  ),
                ),
              ),
            completed: (result) => ({
              title: 'Workflow plan ready',
              detail: `Selected ${result.selected_agents.map((step) => step.agent).join(', ')}.`,
            }),
          })
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
  options: {
    signal?: AbortSignal
    dependency?: consumer_dependency
    timeout_ms?: number
    on_step?: (event: type_ai_workflow_step) => void
    /** Verified server context, never part of workflow data or model inputs. */
    authenticated_payload?: lib_dto_payload
  } = {},
): Promise<type_schema_agent_conductor_result> => {
  const data = schema_agent_conductor_input.parse(input)
  if (options.authenticated_payload && options.authenticated_payload.user_id !== data.user_id) throw lib_error.unauthorized
  const execution_id = crypto.randomUUID()
  const workflow_step_id = crypto.randomUUID()
  const workflow_started_at = performance.now()
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
      options.on_step?.(event)
    } catch {
      // Event consumers must never be able to interrupt the analysis workflow.
    }
  }
  report_event({
    step_id: workflow_step_id,
    type: 'workflow.started',
    agent: null,
    status: 'running',
    title: 'Analysis started',
    detail: 'Preparing the product and brand workflow.',
    metadata: { tool: null, duration_ms: null },
  })
  const timeout_ms = options.timeout_ms ?? ai_workflow_timeout_ms
  const deadline_ms = performance.now() + timeout_ms
  const timeout = AbortSignal.timeout(timeout_ms)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  const workflow = create_consumer_workflow(
    options.dependency ?? default_dependency,
    signal,
    deadline_ms,
    report_event,
    options.authenticated_payload,
  )
  const execution = await workflow.run(data, { executionId: execution_id, userId: String(data.user_id) })

  if (execution.status === 'completed' && execution.result) {
    const result = schema_agent_conductor.parse(execution.result)
    report_event({
      step_id: workflow_step_id,
      type: 'workflow.completed',
      agent: null,
      status: result.status,
      title: 'Analysis finished',
      detail: result.subject ? `Finished analyzing ${result.subject.name}.` : 'The workflow finished without resolving a subject.',
      metadata: { tool: null, duration_ms: Math.round(performance.now() - workflow_started_at) },
    })
    return schema_agent_conductor.parse({ ...result, steps })
  }

  const failure = describe_workflow_failure(execution.error, signal)
  console.error('[ai.workflow.failed]', {
    execution_id,
    step: failure.step,
    code: failure.code,
    provider_status: failure.provider_status,
  })

  report_event({
    step_id: workflow_step_id,
    type: 'workflow.failed',
    agent: null,
    status: 'error',
    title: 'Analysis failed',
    detail: failure.limitation,
    metadata: { tool: null, duration_ms: Math.round(performance.now() - workflow_started_at) },
  })

  return {
    execution_id,
    status: 'error',
    subject: null,
    outcome: null,
    product: null,
    assessments: [],
    alternatives: [],
    explanation: null,
    sources: [],
    limitations: [failure.limitation],
    steps,
  }
}
