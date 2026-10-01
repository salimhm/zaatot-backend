import type { type_schema_agent_dispatcher, type_schema_agent_dispatcher_input } from '@agent/dispatcher/dispatcher.schema.agent'

import { describe, expect, it, spyOn } from 'bun:test'

import { dispatcher_budget_limit } from '@agent/dispatcher/constants'
import { $agent_dispatcher, agent_dispatcher } from '@agent/dispatcher/dispatcher.agent'
import {
  normalize_dispatcher_plan,
  normalize_dispatcher_provider_draft,
  schema_agent_dispatcher,
  schema_agent_dispatcher_provider_draft,
} from '@agent/dispatcher/dispatcher.schema.agent'

function plan_fixture(): type_schema_agent_dispatcher {
  return {
    selected_agents: [
      { agent: 'Detective', depends_on: [], run_when: 'always' },
      { agent: 'Investigator', depends_on: ['Detective'], run_when: 'always' },
      { agent: 'Skeptic', depends_on: ['Detective', 'Investigator'], run_when: 'always' },
      { agent: 'Referee', depends_on: ['Skeptic'], run_when: 'always' },
      { agent: 'Storyteller', depends_on: ['Skeptic', 'Referee'], run_when: 'always' },
      { agent: 'Gatekeeper', depends_on: ['Storyteller'], run_when: 'always' },
    ],
    required_checks: ['identity', 'ethics', 'evidence', 'hard_constraints', 'final_response'],
    budgets: { ...dispatcher_budget_limit, max_alternative_candidates: 0, max_candidate_review_passes: 0 },
    untrusted_content_policy: 'bait_tester_before_consumption',
    candidate_validation: 'not_requested',
  }
}

function nutrition_plan_fixture(): type_schema_agent_dispatcher {
  return {
    ...plan_fixture(),
    selected_agents: [
      { agent: 'Detective', depends_on: [], run_when: 'always' },
      { agent: 'Medic', depends_on: ['Detective'], run_when: 'always', medic_checks: ['portion_calculation'] },
      { agent: 'Skeptic', depends_on: ['Detective', 'Medic'], run_when: 'always' },
      { agent: 'Referee', depends_on: ['Skeptic'], run_when: 'always' },
      { agent: 'Storyteller', depends_on: ['Skeptic', 'Referee'], run_when: 'always' },
      { agent: 'Gatekeeper', depends_on: ['Storyteller'], run_when: 'always' },
    ],
    required_checks: ['identity', 'clinical_risk', 'evidence', 'hard_constraints', 'final_response'],
  }
}

function input_fixture(): type_schema_agent_dispatcher_input {
  return {
    prompt: 'give me info about coca cola',
    bodyguard: { safe: true, action: 'allow', riskLevel: 'none', risks: [], reason: 'Product question', confidence: 1 },
    budget_limits: { ...dispatcher_budget_limit },
  }
}

describe('Dispatcher planning contract', () => {
  it('accepts Groq transport nulls and removes them before internal plan validation', () => {
    const internal_plan = plan_fixture()
    const investigation = { needed: true, reason: 'The user asks who owns the brand.' }
    const provider_plan = {
      ...internal_plan,
      investigation,
      selected_agents: internal_plan.selected_agents.map((step) => ({ ...step, medic_checks: null })),
    }
    expect(schema_agent_dispatcher_provider_draft.safeParse(provider_plan).success).toBe(true)
    expect(schema_agent_dispatcher_provider_draft.safeParse({ ...provider_plan, investigation: undefined }).success).toBe(false)
    expect(normalize_dispatcher_provider_draft(provider_plan)).toEqual({ ...internal_plan, investigation })
  })

  it('accepts brand investigation for a general information plan without selecting unrelated specialists', () => {
    const plan = schema_agent_dispatcher.parse(plan_fixture())
    expect(plan.selected_agents.map((step) => step.agent)).toEqual(['Detective', 'Investigator', 'Skeptic', 'Referee', 'Storyteller', 'Gatekeeper'])
  })

  it('leaves Investigator to the Dispatcher decision instead of requiring it', () => {
    const plan = nutrition_plan_fixture()
    expect(schema_agent_dispatcher.parse(plan)).toEqual(plan)
    expect(normalize_dispatcher_plan(plan)).toEqual(plan)
    for (const agent of ['Detective', 'Skeptic', 'Referee', 'Storyteller', 'Gatekeeper']) {
      expect(
        schema_agent_dispatcher.safeParse({ ...plan, selected_agents: plan.selected_agents.filter((step) => step.agent !== agent) }).success,
      ).toBe(false)
    }
  })

  it('reconciles the ethics check and Skeptic dependency with the selection in both directions', () => {
    const without = plan_fixture()
    without.selected_agents = without.selected_agents.filter((step) => step.agent !== 'Investigator')
    expect(schema_agent_dispatcher.safeParse(without).success).toBe(false)
    const normalized_without = schema_agent_dispatcher.parse(normalize_dispatcher_plan(without))
    expect(normalized_without.selected_agents.map((step) => step.agent)).not.toContain('Investigator')
    expect(normalized_without.required_checks).not.toContain('ethics')
    expect(normalized_without.selected_agents.find((step) => step.agent === 'Skeptic')!.depends_on).toEqual(['Detective'])

    const selected = plan_fixture()
    selected.required_checks = selected.required_checks.filter((check) => check !== 'ethics')
    selected.selected_agents.find((step) => step.agent === 'Skeptic')!.depends_on = ['Detective']
    const normalized_selected = schema_agent_dispatcher.parse(normalize_dispatcher_plan(selected))
    expect(normalized_selected.required_checks).toContain('ethics')
    expect(normalized_selected.selected_agents.find((step) => step.agent === 'Skeptic')!.depends_on).toEqual(['Detective', 'Investigator'])
  })

  it('builds the Investigator step from the investigation decision rather than the listed agents', () => {
    const listed_without = nutrition_plan_fixture()
    const added = schema_agent_dispatcher.parse(
      normalize_dispatcher_plan({ ...listed_without, investigation: { needed: true, reason: 'The user asks whether the brand is boycotted.' } }),
    )
    expect(added.selected_agents.map((step) => step.agent)).toContain('Investigator')
    expect(added.required_checks).toContain('ethics')
    expect(added.selected_agents.find((step) => step.agent === 'Skeptic')!.depends_on).toEqual(['Detective', 'Medic', 'Investigator'])

    const removed = schema_agent_dispatcher.parse(
      normalize_dispatcher_plan({ ...plan_fixture(), investigation: { needed: false, reason: 'Only nutrition is requested.' } }),
    )
    expect(removed.selected_agents.map((step) => step.agent)).not.toContain('Investigator')
    expect(removed.required_checks).not.toContain('ethics')
  })

  it('applies the model investigation decision end to end', async () => {
    const generate = spyOn($agent_dispatcher, 'generateText').mockResolvedValue({
      output: { ...nutrition_plan_fixture(), investigation: { needed: true, reason: 'The user asks whether Coca-Cola is boycotted.' } },
    } as Awaited<ReturnType<typeof $agent_dispatcher.generateText>>)
    try {
      const result = await agent_dispatcher({ ...input_fixture(), prompt: 'is coca cola boycotted ?' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.selected_agents.map((step) => step.agent)).toContain('Investigator')
    } finally {
      generate.mockRestore()
    }
  })

  it('returns a model plan without Investigator unchanged', async () => {
    const generate = spyOn($agent_dispatcher, 'generateText').mockResolvedValue({ output: nutrition_plan_fixture() } as Awaited<
      ReturnType<typeof $agent_dispatcher.generateText>
    >)
    try {
      const result = await agent_dispatcher({ ...input_fixture(), prompt: 'How much sugar is in 330 ml of this?' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.selected_agents.map((step) => step.agent)).not.toContain('Investigator')
    } finally {
      generate.mockRestore()
    }
  })

  it('permits independent selected specialists after identity resolution and waits for both before evidence review', () => {
    const plan = plan_fixture()
    plan.selected_agents.push(
      { agent: 'Medic', depends_on: ['Detective'], run_when: 'always', medic_checks: ['nutrition_assessment'] },
      { agent: 'Eco Scout', depends_on: ['Detective'], run_when: 'always' },
    )
    plan.selected_agents.find((step) => step.agent === 'Skeptic')!.depends_on.push('Medic', 'Eco Scout')
    plan.required_checks.push('clinical_risk', 'environment')
    expect(schema_agent_dispatcher.safeParse(plan).success).toBe(true)
    const medic = plan.selected_agents.find((step) => step.agent === 'Medic')!
    medic.medic_checks = undefined
    expect(schema_agent_dispatcher.safeParse(plan).success).toBe(false)
    medic.medic_checks = ['nutrition_assessment']
    plan.selected_agents.find((step) => step.agent === 'Skeptic')!.depends_on.pop()
    expect(schema_agent_dispatcher.safeParse(plan).success).toBe(false)
  })

  it('rejects a missing final gate, duplicate agents and unmet checks', () => {
    const plan = plan_fixture()
    expect(schema_agent_dispatcher.safeParse({ ...plan, selected_agents: plan.selected_agents.slice(0, -1) }).success).toBe(false)
    expect(schema_agent_dispatcher.safeParse({ ...plan, selected_agents: [...plan.selected_agents, plan.selected_agents[0]] }).success).toBe(false)
    expect(schema_agent_dispatcher.safeParse({ ...plan, required_checks: plan.required_checks.filter((check) => check !== 'ethics') }).success).toBe(
      false,
    )
  })

  it('rejects self-dependencies, missing dependencies and review before evidence checks', () => {
    for (const depends_on of [[], ['Referee'], ['Detective'], ['Skeptic', 'Skeptic']] as const) {
      const plan = plan_fixture()
      plan.selected_agents.find((step) => step.agent === 'Referee')!.depends_on = [...depends_on]
      expect(schema_agent_dispatcher.safeParse(plan).success).toBe(false)
    }
  })

  it('requires Vault Keeper and permission conditions for Coach and Historian', () => {
    const plan = plan_fixture()
    plan.selected_agents.push(
      { agent: 'Vault Keeper', depends_on: [], run_when: 'always' },
      { agent: 'Coach', depends_on: ['Vault Keeper', 'Referee'], run_when: 'personalization_permitted' },
      { agent: 'Historian', depends_on: ['Vault Keeper'], run_when: 'history_permitted' },
    )
    plan.selected_agents.find((step) => step.agent === 'Storyteller')!.depends_on.push('Coach')
    plan.selected_agents.find((step) => step.agent === 'Skeptic')!.depends_on.push('Historian')
    plan.required_checks.push('personal_context', 'goal_fit', 'history')
    expect(schema_agent_dispatcher.safeParse(plan).success).toBe(true)
    const coach = plan.selected_agents.find((step) => step.agent === 'Coach')!
    coach.run_when = 'always'
    expect(schema_agent_dispatcher.safeParse(plan).success).toBe(false)
    coach.run_when = 'personalization_permitted'
    plan.selected_agents = plan.selected_agents.filter((step) => step.agent !== 'Vault Keeper')
    expect(schema_agent_dispatcher.safeParse(plan).success).toBe(false)
  })

  it('requires bounded candidate validation for alternatives', () => {
    const plan = plan_fixture()
    plan.selected_agents.push({ agent: 'Bargain Hunter', depends_on: ['Detective', 'Referee'], run_when: 'always' })
    plan.selected_agents.find((step) => step.agent === 'Storyteller')!.depends_on.push('Bargain Hunter')
    plan.required_checks.push('alternatives')
    expect(schema_agent_dispatcher.safeParse(plan).success).toBe(false)
    plan.budgets.max_alternative_candidates = 2
    plan.budgets.max_candidate_review_passes = 1
    plan.candidate_validation = 'repeat_required_checks'
    expect(schema_agent_dispatcher.safeParse(plan).success).toBe(true)
    plan.budgets.max_alternative_candidates = 4
    expect(schema_agent_dispatcher.safeParse(plan).success).toBe(false)
  })

  it('keeps Bodyguard, Conductor and on-demand Bait Tester out of scheduled specialists', () => {
    for (const agent of ['Bodyguard', 'Conductor', 'Dispatcher', 'Bait Tester', 'Unknown']) {
      const plan = plan_fixture()
      expect(
        schema_agent_dispatcher.safeParse({ ...plan, selected_agents: [...plan.selected_agents, { agent, depends_on: [], run_when: 'always' }] })
          .success,
      ).toBe(false)
    }
  })

  it('rejects disallowed input before making any model call', async () => {
    const generate = spyOn($agent_dispatcher, 'generateText')
    try {
      for (const bodyguard of [
        { ...input_fixture().bodyguard, safe: false },
        { ...input_fixture().bodyguard, action: 'sanitize' as const },
        { ...input_fixture().bodyguard, action: 'human_review' as const },
      ]) {
        expect((await agent_dispatcher({ ...input_fixture(), bodyguard })).success).toBe(false)
      }
      expect(generate).not.toHaveBeenCalled()
    } finally {
      generate.mockRestore()
    }
  })

  it('returns the structured plan and respects a tighter remaining server budget', async () => {
    const generate = spyOn($agent_dispatcher, 'generateText').mockResolvedValue({ output: plan_fixture() } as Awaited<
      ReturnType<typeof $agent_dispatcher.generateText>
    >)
    try {
      const result = await agent_dispatcher(input_fixture())
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.budgets.timeout_ms).toBeLessThanOrEqual(dispatcher_budget_limit.timeout_ms)
      const input = input_fixture()
      input.budget_limits.max_tool_calls = 1
      expect((await agent_dispatcher(input)).success).toBe(false)
      expect(generate.mock.calls[0]?.[1]?.maxRetries).toBe(0)
    } finally {
      generate.mockRestore()
    }
  })

  it('zeros copied alternative ceilings for a plan that does not select Bargain Hunter', async () => {
    const draft = { ...plan_fixture(), budgets: { ...dispatcher_budget_limit } }
    // This is the exact cross-field violation reproduced with Groq.
    expect(schema_agent_dispatcher.safeParse(draft).success).toBe(false)
    const generate = spyOn($agent_dispatcher, 'generateText').mockResolvedValue({ output: draft } as Awaited<
      ReturnType<typeof $agent_dispatcher.generateText>
    >)
    try {
      const result = await agent_dispatcher(input_fixture())
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.budgets.max_alternative_candidates).toBe(0)
        expect(result.data.budgets.max_candidate_review_passes).toBe(0)
        expect(result.data.selected_agents).toEqual(draft.selected_agents)
        expect(result.data.candidate_validation).toBe('not_requested')
        expect(schema_agent_dispatcher.safeParse(result.data).success).toBe(true)
      }
      expect(draft.budgets.max_alternative_candidates).toBe(dispatcher_budget_limit.max_alternative_candidates)
    } finally {
      generate.mockRestore()
    }
  })

  it('still rejects invalid dependencies, candidate policies and over-budget drafts after normalization', async () => {
    const generate = spyOn($agent_dispatcher, 'generateText')
    try {
      const invalid_dependencies = plan_fixture()
      invalid_dependencies.selected_agents.find((step) => step.agent === 'Storyteller')!.depends_on = []
      for (const draft of [invalid_dependencies, { ...plan_fixture(), candidate_validation: 'repeat_required_checks' }]) {
        generate.mockResolvedValue({ output: { ...draft, budgets: { ...dispatcher_budget_limit } } } as Awaited<
          ReturnType<typeof $agent_dispatcher.generateText>
        >)
        expect((await agent_dispatcher(input_fixture())).success).toBe(false)
      }
      generate.mockResolvedValue({ output: { ...plan_fixture(), budgets: { ...dispatcher_budget_limit } } } as Awaited<
        ReturnType<typeof $agent_dispatcher.generateText>
      >)
      const input = input_fixture()
      input.budget_limits.max_alternative_candidates = 1
      expect((await agent_dispatcher(input)).success).toBe(false)
    } finally {
      generate.mockRestore()
    }
  })

  it('preserves valid alternative allocations and rejects missing candidate-review capacity', async () => {
    const draft = plan_fixture()
    draft.selected_agents.push({ agent: 'Bargain Hunter', depends_on: ['Detective', 'Referee'], run_when: 'always' })
    draft.selected_agents.find((step) => step.agent === 'Storyteller')!.depends_on.push('Bargain Hunter')
    draft.required_checks.push('alternatives')
    draft.candidate_validation = 'repeat_required_checks'
    draft.budgets.max_alternative_candidates = 2
    draft.budgets.max_candidate_review_passes = 1
    const generate = spyOn($agent_dispatcher, 'generateText').mockResolvedValue({ output: draft } as Awaited<
      ReturnType<typeof $agent_dispatcher.generateText>
    >)
    try {
      const result = await agent_dispatcher(input_fixture())
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.budgets.max_alternative_candidates).toBe(2)
        expect(result.data.budgets.max_candidate_review_passes).toBe(1)
      }
      draft.budgets.max_candidate_review_passes = 0
      expect((await agent_dispatcher(input_fixture())).success).toBe(false)
    } finally {
      generate.mockRestore()
    }
  })

  it('honors cancellation before invoking the model', async () => {
    const generate = spyOn($agent_dispatcher, 'generateText')
    try {
      expect((await agent_dispatcher(input_fixture(), AbortSignal.abort())).success).toBe(false)
      expect(generate).not.toHaveBeenCalled()
    } finally {
      generate.mockRestore()
    }
  })
})
