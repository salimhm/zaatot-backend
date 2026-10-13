import type { type_schema_agent_dispatcher, type_schema_agent_dispatcher_input } from '@agent/dispatcher/dispatcher.schema.agent'

import { describe, expect, it, spyOn } from 'bun:test'

import { $agent_dispatcher, agent_dispatcher } from '@agent/dispatcher/dispatcher.agent'
import {
  dispatcher_budget_limit,
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
  it('accepts provider transport nulls and removes them before internal plan validation', () => {
    const internal_plan = plan_fixture()
    const investigation = { needed: true, reason: 'The user asks who owns the brand.' }
    const history = { needed: false, product_named: true, reason: 'The user does not ask about their own past scans.' }
    const provider_plan = {
      ...internal_plan,
      investigation,
      history,
      selected_agents: internal_plan.selected_agents.map((step) => ({ ...step, medic_checks: null })),
    }
    expect(schema_agent_dispatcher_provider_draft.safeParse(provider_plan).success).toBe(true)
    expect(schema_agent_dispatcher_provider_draft.safeParse({ ...provider_plan, investigation: undefined }).success).toBe(false)
    expect(schema_agent_dispatcher_provider_draft.safeParse({ ...provider_plan, history: undefined }).success).toBe(false)
    expect(normalize_dispatcher_provider_draft(provider_plan)).toEqual({ ...internal_plan, investigation, history })
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
    // This is the exact cross-field violation the runtime normalizes before validation.
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

  it('rebuilds dependencies when optional agents make the provider graph inconsistent', () => {
    const draft = plan_fixture()
    draft.selected_agents.push({ agent: 'Bargain Hunter', depends_on: ['Skeptic'], run_when: 'always' })
    draft.selected_agents.find((step) => step.agent === 'Skeptic')!.depends_on.push('Bargain Hunter')
    draft.selected_agents.find((step) => step.agent === 'Storyteller')!.depends_on = ['Skeptic', 'Referee']
    draft.required_checks.push('alternatives')
    draft.candidate_validation = 'repeat_required_checks'
    draft.budgets.max_alternative_candidates = 2
    draft.budgets.max_candidate_review_passes = 1
    expect(schema_agent_dispatcher.safeParse(draft).success).toBe(false)

    const plan = schema_agent_dispatcher.parse(normalize_dispatcher_plan(draft))

    expect(plan.selected_agents.find((step) => step.agent === 'Skeptic')!.depends_on).toEqual(['Detective', 'Investigator'])
    expect(plan.selected_agents.find((step) => step.agent === 'Bargain Hunter')!.depends_on).toEqual(['Detective', 'Referee'])
    expect(plan.selected_agents.find((step) => step.agent === 'Storyteller')!.depends_on).toEqual(['Skeptic', 'Referee', 'Bargain Hunter'])
  })

  it('still rejects invalid candidate policies and over-budget drafts after normalization', async () => {
    const generate = spyOn($agent_dispatcher, 'generateText')
    try {
      for (const draft of [{ ...plan_fixture(), candidate_validation: 'repeat_required_checks' }]) {
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
  it('adds the personal_context check and Medic waiting for Vault Keeper when Vault Keeper is selected', () => {
    // The shape the model returned for "How much sugar would I consume from 330 ml of barcode …?".
    const draft = nutrition_plan_fixture()
    draft.selected_agents.push({ agent: 'Vault Keeper', depends_on: [], run_when: 'always' })
    expect(schema_agent_dispatcher.safeParse(draft).success).toBe(false)

    const plan = schema_agent_dispatcher.parse(normalize_dispatcher_plan(draft))

    expect(plan.selected_agents.find((step) => step.agent === 'Medic')!.depends_on).toEqual(['Detective', 'Vault Keeper'])
    expect(plan.required_checks).toContain('personal_context')
  })

  it('removes the personal_context check and Medic waiting for Vault Keeper when Vault Keeper is not selected', () => {
    const draft = nutrition_plan_fixture()
    draft.selected_agents.find((step) => step.agent === 'Medic')!.depends_on = ['Detective', 'Vault Keeper']
    draft.required_checks.push('personal_context')
    expect(schema_agent_dispatcher.safeParse(draft).success).toBe(false)

    const plan = schema_agent_dispatcher.parse(normalize_dispatcher_plan(draft))

    expect(plan.selected_agents.find((step) => step.agent === 'Medic')!.depends_on).toEqual(['Detective'])
    expect(plan.required_checks).not.toContain('personal_context')
  })

  it('accepts a model plan that selects Vault Keeper but forgets its check and Medic dependency', async () => {
    const draft = nutrition_plan_fixture()
    draft.selected_agents.push({ agent: 'Vault Keeper', depends_on: [], run_when: 'always' })
    const generate = spyOn($agent_dispatcher, 'generateText').mockResolvedValue({
      output: { ...draft, investigation: { needed: false, reason: 'Only nutrition is requested.' } },
    } as Awaited<ReturnType<typeof $agent_dispatcher.generateText>>)
    try {
      const result = await agent_dispatcher({ ...input_fixture(), prompt: 'How much sugar would I consume from 330 ml of barcode 5449000054227?' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.required_checks).toContain('personal_context')
        expect(result.data.selected_agents.find((step) => step.agent === 'Medic')!.depends_on).toEqual(['Detective', 'Vault Keeper'])
      }
    } finally {
      generate.mockRestore()
    }
  })

  // The five core agents only, as the model lists them for a request that needs no specialist.
  const core_plan_fixture = (): type_schema_agent_dispatcher => {
    const plan = nutrition_plan_fixture()
    plan.selected_agents = plan.selected_agents.filter((step) => step.agent !== 'Medic')
    plan.selected_agents.find((step) => step.agent === 'Skeptic')!.depends_on = ['Detective']
    plan.required_checks = plan.required_checks.filter((check) => check !== 'clinical_risk')
    return plan
  }

  const history_only = { needed: true, product_named: false, reason: 'The user asks which products they scanned last month.' }

  it('selects Vault Keeper, Historian, their checks and Skeptic dependency for a history request that names a product', () => {
    const plan = schema_agent_dispatcher.parse(
      normalize_dispatcher_plan({
        ...core_plan_fixture(),
        history: { needed: true, product_named: true, reason: 'The user asks whether they scanned Coca-Cola last month.' },
      }),
    )

    expect(plan.selected_agents.find((step) => step.agent === 'Vault Keeper')).toEqual({ agent: 'Vault Keeper', depends_on: [], run_when: 'always' })
    expect(plan.selected_agents.find((step) => step.agent === 'Historian')).toEqual({
      agent: 'Historian',
      depends_on: ['Vault Keeper'],
      run_when: 'history_permitted',
    })
    expect(plan.selected_agents.find((step) => step.agent === 'Skeptic')!.depends_on).toEqual(['Detective', 'Historian'])
    expect(plan.required_checks).toEqual(expect.arrayContaining(['identity', 'personal_context', 'history']))
  })

  it('keeps Detective in a history-only plan but lets Skeptic review the history without waiting for it', () => {
    const plan = schema_agent_dispatcher.parse(normalize_dispatcher_plan({ ...core_plan_fixture(), history: history_only }))

    expect(plan.selected_agents.map((step): string => step.agent).sort()).toEqual(
      ['Detective', 'Gatekeeper', 'Historian', 'Referee', 'Skeptic', 'Storyteller', 'Vault Keeper'].sort(),
    )
    expect(plan.selected_agents.find((step) => step.agent === 'Skeptic')!.depends_on).toEqual(['Historian'])
    expect(plan.required_checks).toEqual(expect.arrayContaining(['identity', 'personal_context', 'history', 'evidence']))
  })

  it('keeps Detective for a history request when a product specialist is selected', () => {
    const plan = schema_agent_dispatcher.parse(normalize_dispatcher_plan({ ...nutrition_plan_fixture(), history: history_only }))

    // Medic needs an identity, so Skeptic keeps waiting for Detective.
    expect(plan.selected_agents.find((step) => step.agent === 'Skeptic')!.depends_on).toEqual(['Detective', 'Medic', 'Historian'])
    expect(plan.required_checks).toContain('identity')
    // Medic depends on Vault Keeper whenever both are selected.
    expect(plan.selected_agents.find((step) => step.agent === 'Medic')!.depends_on).toEqual(['Detective', 'Vault Keeper'])
    expect(plan.selected_agents.filter((step) => step.agent === 'Vault Keeper')).toHaveLength(1)
  })

  it('requires Detective in every plan and lets Skeptic skip it only in a history-only plan', () => {
    const plan = schema_agent_dispatcher.parse(normalize_dispatcher_plan({ ...core_plan_fixture(), history: history_only }))
    const without_detective = {
      ...plan,
      selected_agents: plan.selected_agents.filter((step) => step.agent !== 'Detective'),
      required_checks: plan.required_checks.filter((check) => check !== 'identity'),
    }
    expect(schema_agent_dispatcher.safeParse(without_detective).success).toBe(false)

    // A request that names a product needs its identity before Skeptic reviews anything.
    const named = { ...plan, history: { ...history_only, product_named: true } }
    expect(schema_agent_dispatcher.safeParse(named).success).toBe(false)
    const repaired = schema_agent_dispatcher.parse(normalize_dispatcher_plan(named))
    expect(repaired.selected_agents.find((step) => step.agent === 'Skeptic')!.depends_on).toEqual(['Detective', 'Historian'])
  })

  it('keeps an already selected Vault Keeper and repairs Historian details the model got wrong', () => {
    const draft = plan_fixture()
    draft.selected_agents.push(
      { agent: 'Vault Keeper', depends_on: [], run_when: 'always' },
      { agent: 'Historian', depends_on: [], run_when: 'always' },
    )
    draft.required_checks.push('personal_context')

    const plan = schema_agent_dispatcher.parse(
      normalize_dispatcher_plan({
        ...draft,
        history: { needed: true, product_named: true, reason: 'The user asks what they scanned of this brand.' },
      }),
    )

    expect(plan.selected_agents.filter((step) => step.agent === 'Vault Keeper')).toHaveLength(1)
    expect(plan.selected_agents.find((step) => step.agent === 'Historian')).toMatchObject({
      depends_on: ['Vault Keeper'],
      run_when: 'history_permitted',
    })
    expect(plan.required_checks.filter((check) => check === 'personal_context')).toHaveLength(1)
  })

  it('removes Historian when the history decision says it is not needed but keeps Vault Keeper', () => {
    const draft = plan_fixture()
    draft.selected_agents.push(
      { agent: 'Vault Keeper', depends_on: [], run_when: 'always' },
      { agent: 'Historian', depends_on: ['Vault Keeper'], run_when: 'history_permitted' },
    )
    draft.selected_agents.find((step) => step.agent === 'Skeptic')!.depends_on.push('Historian')
    draft.required_checks.push('personal_context', 'history')

    const plan = schema_agent_dispatcher.parse(
      normalize_dispatcher_plan({ ...draft, history: { needed: false, product_named: true, reason: 'The user asks about the brand itself.' } }),
    )

    expect(plan.selected_agents.map((step) => step.agent)).not.toContain('Historian')
    expect(plan.selected_agents.map((step) => step.agent)).toContain('Vault Keeper')
    expect(plan.required_checks).not.toContain('history')
    expect(plan.selected_agents.find((step) => step.agent === 'Skeptic')!.depends_on).not.toContain('Historian')
  })

  it('applies the model history decision end to end', async () => {
    const generate = spyOn($agent_dispatcher, 'generateText').mockResolvedValue({
      output: { ...core_plan_fixture(), investigation: { needed: false, reason: 'No ownership or ethics question.' }, history: history_only },
    } as Awaited<ReturnType<typeof $agent_dispatcher.generateText>>)
    try {
      const result = await agent_dispatcher({ ...input_fixture(), prompt: 'give me last month product' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.selected_agents.map((step) => step.agent)).toEqual(expect.arrayContaining(['Detective', 'Vault Keeper', 'Historian']))
        expect(result.data.selected_agents.find((step) => step.agent === 'Skeptic')!.depends_on).toEqual(['Historian'])
      }
    } finally {
      generate.mockRestore()
    }
  })

  it("sets each agent's run_when from its role instead of trusting the model", () => {
    // The shape the model returned in a failing run: Vault Keeper waiting for a permission it grants itself.
    const draft = nutrition_plan_fixture()
    draft.selected_agents.push({ agent: 'Vault Keeper', depends_on: [], run_when: 'personalization_permitted' })
    draft.selected_agents.find((step) => step.agent === 'Medic')!.run_when = 'history_permitted'

    const plan = schema_agent_dispatcher.parse(normalize_dispatcher_plan(draft))

    expect(plan.selected_agents.find((step) => step.agent === 'Vault Keeper')!.run_when).toBe('always')
    expect(plan.selected_agents.find((step) => step.agent === 'Medic')!.run_when).toBe('always')
  })
})
