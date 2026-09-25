import { z } from 'zod'

import { SecurityDecision } from '@agent/bodyguard/bodyguard.schema.agent'
import { schema_agent_conductor_plan } from '@agent/conductor/conductor.schema.agent'
import { dispatcher_budget_limit, enum_dispatcher_agent, enum_dispatcher_check } from '@agent/dispatcher/constants'

export const schema_agent_dispatcher_budget = z.object({
  timeout_ms: z
    .number()
    .int()
    .min(1)
    .max(dispatcher_budget_limit.timeout_ms)
    .describe('Total remaining execution budget, not a fresh timeout per agent'),
  max_tool_calls: z
    .number()
    .int()
    .min(0)
    .max(dispatcher_budget_limit.max_tool_calls)
    .describe('Total remaining tool-call budget, including candidate reviews'),
  max_retries: z
    .number()
    .int()
    .min(0)
    .max(dispatcher_budget_limit.max_retries)
    .describe('Maximum retries per failed step within the shared deadline'),
  max_alternative_candidates: z.number().int().min(0).max(dispatcher_budget_limit.max_alternative_candidates),
  max_candidate_review_passes: z.number().int().min(0).max(dispatcher_budget_limit.max_candidate_review_passes),
  max_response_repairs: z.number().int().min(0).max(dispatcher_budget_limit.max_response_repairs),
})

export const schema_agent_dispatcher_input = z.object({
  prompt: z.string().trim().min(1).max(4000),
  bodyguard: SecurityDecision.refine((decision) => decision.safe && decision.action === 'allow', 'Dispatcher requires Bodyguard approval'),
  conductor_plan: schema_agent_conductor_plan.optional(),
  budget_limits: schema_agent_dispatcher_budget,
})

// Model output is a draft; adapters must apply the full plan validator before execution.
export const schema_agent_dispatcher_draft = z.object({
  selected_agents: z
    .array(
      z.object({
        agent: z.enum(enum_dispatcher_agent),
        depends_on: z.array(z.enum(enum_dispatcher_agent)).max(enum_dispatcher_agent.length),
        run_when: z.enum(['always', 'personalization_permitted', 'history_permitted']),
      }),
    )
    .min(5)
    .max(enum_dispatcher_agent.length)
    .describe('Unique selected steps. Independent ready steps may run in parallel; dependencies must finish first'),
  required_checks: z.array(z.enum(enum_dispatcher_check)).min(4).max(enum_dispatcher_check.length),
  budgets: schema_agent_dispatcher_budget,
  untrusted_content_policy: z
    .literal('bait_tester_before_consumption')
    .describe('Invoke Bait Tester on demand before any downstream step consumes untrusted content'),
  candidate_validation: z
    .enum(['not_requested', 'repeat_required_checks'])
    .describe('Alternatives require identity resolution, applicable specialists, Skeptic, Referee and Coach when selected'),
})

export type type_schema_agent_dispatcher_draft = z.infer<typeof schema_agent_dispatcher_draft>

export const normalize_dispatcher_plan = (draft: type_schema_agent_dispatcher_draft): type_schema_agent_dispatcher_draft => {
  const has_detective = draft.selected_agents.some((step) => step.agent === 'Detective')
  const has_investigator = draft.selected_agents.some((step) => step.agent === 'Investigator')
  if (!has_detective || has_investigator) return draft

  const selected_agents = draft.selected_agents.flatMap((step) => {
    const normalized =
      step.agent === 'Skeptic' && !step.depends_on.includes('Investigator')
        ? { ...step, depends_on: [...step.depends_on, 'Investigator' as const] }
        : step
    return step.agent === 'Detective'
      ? [normalized, { agent: 'Investigator' as const, depends_on: ['Detective' as const], run_when: 'always' as const }]
      : [normalized]
  })

  return {
    ...draft,
    selected_agents,
    required_checks: draft.required_checks.includes('ethics') ? [...draft.required_checks] : [...draft.required_checks, 'ethics'],
  }
}

export const schema_agent_dispatcher = schema_agent_dispatcher_draft.superRefine((plan, context) => {
  const names = plan.selected_agents.map((step) => step.agent)
  const has = (name: (typeof enum_dispatcher_agent)[number]) => names.includes(name)
  const reject = (message: string) => context.addIssue({ code: 'custom', message })

  if (new Set(names).size !== names.length) reject('Each agent must be selected only once')
  if (new Set(plan.required_checks).size !== plan.required_checks.length) reject('Required checks must be unique')
  for (const agent of ['Detective', 'Investigator', 'Skeptic', 'Referee', 'Storyteller', 'Gatekeeper'] as const) {
    if (!has(agent)) reject(`${agent} is required for an analysis plan`)
  }

  const check_agent = {
    identity: 'Detective',
    personal_context: 'Vault Keeper',
    clinical_risk: 'Medic',
    ethics: 'Investigator',
    environment: 'Eco Scout',
    history: 'Historian',
    evidence: 'Skeptic',
    hard_constraints: 'Referee',
    goal_fit: 'Coach',
    alternatives: 'Bargain Hunter',
    final_response: 'Gatekeeper',
  } as const
  for (const check of enum_dispatcher_check) {
    if (plan.required_checks.includes(check) !== has(check_agent[check])) reject(`${check} must match selection of ${check_agent[check]}`)
  }

  const dependencies: Record<(typeof enum_dispatcher_agent)[number], readonly (typeof enum_dispatcher_agent)[number][]> = {
    Detective: [],
    'Vault Keeper': [],
    Medic: ['Detective', ...(has('Vault Keeper') ? ['Vault Keeper' as const] : [])],
    Investigator: ['Detective'],
    'Eco Scout': ['Detective'],
    Historian: ['Vault Keeper'],
    Skeptic: ['Detective', ...(['Medic', 'Investigator', 'Eco Scout', 'Historian'] as const).filter(has)],
    Referee: ['Skeptic'],
    Coach: ['Vault Keeper', 'Referee'],
    'Bargain Hunter': ['Detective', 'Referee', ...(has('Coach') ? ['Coach' as const] : [])],
    Storyteller: ['Skeptic', 'Referee', ...(['Coach', 'Bargain Hunter'] as const).filter(has)],
    Gatekeeper: ['Storyteller'],
  }
  for (const step of plan.selected_agents) {
    const expected = dependencies[step.agent]
    if (
      step.depends_on.length !== expected.length ||
      expected.some((dependency) => !step.depends_on.includes(dependency)) ||
      step.depends_on.some((dependency) => !has(dependency))
    ) {
      reject(`Invalid dependencies for ${step.agent}`)
    }
    const condition = step.agent === 'Coach' ? 'personalization_permitted' : step.agent === 'Historian' ? 'history_permitted' : 'always'
    if (step.run_when !== condition) reject(`${step.agent} must use run_when=${condition}`)
  }

  if (has('Bargain Hunter')) {
    if (
      plan.candidate_validation !== 'repeat_required_checks' ||
      plan.budgets.max_alternative_candidates < 1 ||
      plan.budgets.max_candidate_review_passes < 1
    ) {
      reject('Alternatives require a bounded candidate review before recommendation')
    }
  } else if (
    plan.candidate_validation !== 'not_requested' ||
    plan.budgets.max_alternative_candidates !== 0 ||
    plan.budgets.max_candidate_review_passes !== 0
  ) {
    reject('Alternative budgets must be zero when Bargain Hunter is not selected')
  }
})

export type type_schema_agent_dispatcher = z.infer<typeof schema_agent_dispatcher>
export type type_schema_agent_dispatcher_input = z.infer<typeof schema_agent_dispatcher_input>
