import type {
  type_schema_agent_dispatcher,
  type_schema_agent_dispatcher_draft,
  type_schema_agent_dispatcher_input,
} from '@agent/dispatcher/dispatcher.schema.agent'
import type { consumer_specialist, consumer_specialist_name, consumer_step_result } from '@ai/execution/execution-contract.ai'
import type { consumer_dependency } from '@ai/workflow.ai'
import type { lib_dto_payload } from '@lib/dto.lib'

import { describe, expect, it, mock, spyOn } from 'bun:test'

import { run_consumer_workflow } from '@ai/workflow.ai'
import { normalize_dispatcher_plan, schema_agent_dispatcher } from '@agent/dispatcher/dispatcher.schema.agent'

const request = { prompt: 'Check this cereal and suggest an alternative', user_id: 7 }
const core: consumer_specialist_name[] = ['Detective', 'Investigator', 'Skeptic', 'Referee', 'Storyteller', 'Gatekeeper']
const dependencies: Record<consumer_specialist_name, consumer_specialist_name[]> = {
  Detective: [],
  'Vault Keeper': [],
  Medic: ['Detective', 'Vault Keeper'],
  Investigator: ['Detective'],
  'Eco Scout': ['Detective'],
  Historian: ['Vault Keeper'],
  Skeptic: ['Detective', 'Medic', 'Investigator', 'Eco Scout', 'Historian'],
  Referee: ['Skeptic'],
  Coach: ['Vault Keeper', 'Referee'],
  'Bargain Hunter': ['Detective', 'Referee', 'Coach'],
  Storyteller: ['Skeptic', 'Referee', 'Coach', 'Bargain Hunter'],
  Gatekeeper: ['Storyteller'],
}
const checks: Partial<Record<consumer_specialist_name, type_schema_agent_dispatcher['required_checks'][number]>> = {
  Detective: 'identity',
  'Vault Keeper': 'personal_context',
  Medic: 'clinical_risk',
  Investigator: 'ethics',
  'Eco Scout': 'environment',
  Historian: 'history',
  Skeptic: 'evidence',
  Referee: 'hard_constraints',
  Coach: 'goal_fit',
  'Bargain Hunter': 'alternatives',
  Gatekeeper: 'final_response',
}
const all = Object.keys(dependencies) as consumer_specialist_name[]
const complete = (output: unknown = {}): consumer_step_result => ({ status: 'completed', output, limitations: [] })

function fixture(
  selected = all,
  medic_checks = ['nutrition_assessment', 'restriction_check', 'portion_calculation'],
  // A Dispatcher history decision; the plan then goes through the backend normalization like a real one.
  history?: type_schema_agent_dispatcher['history'],
) {
  const calls: string[] = []
  const handlers = Object.fromEntries(
    all.map((agent) => [
      agent,
      mock<consumer_specialist>(async (input) => {
        calls.push(agent)
        if (agent === 'Vault Keeper')
          return { ...complete({ permitted_context: 'private-context' }), permissions: { personalization: true, history: true } }
        if (agent === 'Gatekeeper')
          return complete({
            execution_id: input.execution_id,
            status: 'completed',
            subject: { type: 'product', name: 'Reviewed cereal', barcode: null, brand: null },
            outcome: 'evidence_found',
            product: { barcode: null, name: 'Reviewed cereal', brand: null },
            assessments: [],
            alternatives: [],
            explanation: null,
            sources: [],
            limitations: [],
          })
        return complete({ agent })
      }),
    ]),
  ) as Record<consumer_specialist_name, ReturnType<typeof mock<consumer_specialist>>>
  const candidate_review = mock<consumer_specialist>(async () => {
    calls.push('Candidate review')
    return complete({ candidates: [] })
  })
  const plan = (input: type_schema_agent_dispatcher_input): type_schema_agent_dispatcher => {
    const draft = {
      selected_agents: selected.map((agent) => ({
        agent,
        depends_on: dependencies[agent].filter((name) => selected.includes(name)),
        run_when: agent === 'Coach' ? 'personalization_permitted' : agent === 'Historian' ? 'history_permitted' : 'always',
        ...(agent === 'Medic' ? { medic_checks } : {}),
      })),
      required_checks: selected.flatMap((agent) => (checks[agent] ? [checks[agent]] : [])),
      budgets: {
        ...input.budget_limits,
        max_retries: 0,
        max_alternative_candidates: selected.includes('Bargain Hunter') ? 2 : 0,
        max_candidate_review_passes: selected.includes('Bargain Hunter') ? 1 : 0,
      },
      untrusted_content_policy: 'bait_tester_before_consumption',
      candidate_validation: selected.includes('Bargain Hunter') ? 'repeat_required_checks' : 'not_requested',
      ...(history ? { history } : {}),
    } as type_schema_agent_dispatcher_draft
    return schema_agent_dispatcher.parse(history ? normalize_dispatcher_plan(draft) : draft)
  }
  const dependency: consumer_dependency = {
    bodyguard: mock(async () => ({ safe: true, action: 'allow', riskLevel: 'none', risks: [], reason: 'Allowed', confidence: 1 })),
    conductor: mock(async () => ({ intent: 'Product analysis', steps: [] })),
    dispatcher: mock(async (input) => plan(input)),
    specialists: handlers,
    candidate_review,
  }
  return { dependency, handlers, candidate_review, calls, plan }
}

describe('Consumer specialist workflow slots', () => {
  it('provides verified claims only to Vault Keeper and Historian through backend context', async () => {
    const { dependency, handlers, candidate_review } = fixture()
    const authenticated_payload = {
      user_id: request.user_id,
      tenants: [
        { tenant_id: request.user_id, tenant_type: 'user' as const, tenant_schema_version: 'private-tenant-version', extra: 'private-extra' },
      ],
      token: 'private-token',
    }
    const inspect = mock(async (text: string, _signal: AbortSignal) => ({ usable: true, text }))
    dependency.bait_tester = inspect
    handlers.Detective.mockImplementation(async (input) => complete(await input.inspect_content('catalog facts')))
    const planners = [spyOn(dependency, 'bodyguard'), spyOn(dependency, 'conductor'), spyOn(dependency, 'dispatcher')]
    const log = spyOn(console, 'info').mockImplementation(() => {})
    const events: unknown[] = []
    try {
      const result = await run_consumer_workflow(request, { dependency, authenticated_payload, on_step: (event) => events.push(event) })
      expect(result.status).toBe('completed')
      const context = handlers['Vault Keeper'].mock.calls[0]![2]
      // Historian reads the user's own scan history, so it receives the same verified snapshot.
      expect(handlers.Historian.mock.calls[0]![2]).toEqual(context)
      expect(context).toEqual({
        payload: {
          user_id: request.user_id,
          tenants: [{ tenant_id: request.user_id, tenant_type: 'user', tenant_schema_version: 'private-tenant-version' }],
        },
      })
      expect(context!.payload).not.toBe(authenticated_payload)
      expect(context!.payload.tenants).not.toBe(authenticated_payload.tenants)
      expect(context!.payload.tenants![0]).not.toBe(authenticated_payload.tenants[0])
      for (const agent of all.filter((name) => name !== 'Vault Keeper' && name !== 'Historian')) {
        expect(handlers[agent]).toHaveBeenCalled()
        for (const call of handlers[agent].mock.calls) expect(call).toHaveLength(2)
      }
      for (const call of candidate_review.mock.calls) expect(call).toHaveLength(2)
      const exposed = JSON.stringify({
        result,
        events,
        planner_calls: planners.map((planner) => planner.mock.calls),
        specialist_inputs: all.flatMap((agent) => handlers[agent].mock.calls.map(([input]) => input)),
        inspection_calls: inspect.mock.calls,
        review_calls: candidate_review.mock.calls,
        logs: log.mock.calls,
      })
      for (const secret of ['private-tenant-version', 'private-extra', 'private-token']) expect(exposed).not.toContain(secret)
    } finally {
      planners.forEach((planner) => planner.mockRestore())
      log.mockRestore()
    }
  })

  it('passes the client time zone only to Historian', async () => {
    const { dependency, handlers } = fixture()
    const result = await run_consumer_workflow({ ...request, time_zone: 'Africa/Casablanca' }, { dependency })
    expect(result.status).toBe('completed')
    expect(handlers.Historian.mock.calls[0]![0].time_zone).toBe('Africa/Casablanca')
    for (const agent of all.filter((name) => name !== 'Historian')) {
      for (const [input] of handlers[agent].mock.calls) expect(input).not.toHaveProperty('time_zone')
    }
    await expect(run_consumer_workflow({ ...request, time_zone: '../etc/passwd' }, { dependency })).rejects.toThrow()
  })

  const history_agents: consumer_specialist_name[] = ['Detective', 'Vault Keeper', 'Historian', 'Skeptic', 'Referee', 'Storyteller', 'Gatekeeper']
  const history_only = { needed: true, product_named: false, reason: 'The user asks which products they scanned this month.' }
  // What Detective returns for a request that names no product.
  const no_product = {
    status: 'needs_input' as const,
    output: null,
    limitations: ['Detective could not resolve the product or brand. Provide a more specific name or barcode.'],
  }
  const history_review = {
    status: 'available' as const,
    summary: 'This month you scanned 12 products; most had Nutri-Score D or E.',
    findings: [
      { pattern_id: 'nutriscore_distribution', statement: '8 of the 12 products you scanned had Nutri-Score D or E.' },
      { pattern_id: 'nutriscore_distribution', statement: 'You bought mostly unhealthy products.' },
    ],
    limitations: ['Window: this month.'],
  }
  const history_output = {
    status: 'available',
    time_window: { label: 'this month', from: '2026-10-01T00:00:00.000Z', to: '2026-10-08T10:00:00.000Z', time_zone: 'UTC' },
    focus: ['nutriscore'],
    analysis: {
      status: 'available',
      total_scans: 12,
      truncated: false,
      patterns: [{ id: 'nutriscore_distribution', kind: 'grade_distribution', values: { d: 4, e: 4, graded_scans: 12 } }],
      limitations: [],
    },
    review: history_review,
    limitations: [],
  }
  const skeptic_review = (accepted: string[]) => ({
    status: 'reviewed' as const,
    accepted_claims: accepted.map((claim_ref) => ({
      claim_ref,
      claim: claim_ref,
      evidence_refs: ['historian.patterns.nutriscore_distribution'],
      qualification: null,
    })),
    unsupported_claims: ['historian.summary', 'historian.findings[0]', 'historian.findings[1]']
      .filter((claim_ref) => !accepted.includes(claim_ref))
      .map((claim_ref) => ({ claim_ref, claim: claim_ref, reason: 'Not supported by the computed pattern.', evidence_refs: [] })),
    stale_sources: [],
    uncertainties: [],
    targeted_rechecks: [],
  })

  it('answers a history-only request although Detective finds no product, presenting only what Skeptic accepted', async () => {
    const { dependency, handlers } = fixture(history_agents, undefined, history_only)
    // Without Gatekeeper, the result is built from the specialist outputs rather than an approved response.
    dependency.specialists!.Gatekeeper = null
    handlers.Detective.mockResolvedValue(no_product)
    handlers.Historian.mockResolvedValue(complete(history_output))
    handlers.Skeptic.mockResolvedValue(complete(skeptic_review(['historian.summary', 'historian.findings[0]'])))
    const events: { agent: string | null; type: string; title: string; detail: string | null }[] = []

    const result = await run_consumer_workflow(request, { dependency, on_step: (event) => events.push(event) })

    // Detective still runs, but Skeptic reviews only the history and the result leaves Detective out.
    expect(handlers.Detective).toHaveBeenCalledTimes(1)
    expect(Object.keys(handlers.Skeptic.mock.calls[0]![0].dependencies)).toEqual(['Historian'])
    expect(result.status).toBe('completed')
    expect(result.subject).toBeNull()
    expect(result.outcome).toBeNull()
    expect(result.assessments.map((assessment) => assessment.agent)).not.toContain('Detective')
    expect(result.limitations).not.toContain(no_product.limitations[0]!)
    expect(result.assessments.find((assessment) => assessment.agent === 'Historian')).toMatchObject({
      status: 'completed',
      summary: history_review.summary,
    })
    // The finding Skeptic rejected ("you bought…") is not presented.
    expect(result.explanation).toEqual({
      summary: history_review.summary,
      reasons: [history_review.findings[0]!.statement],
      tradeoffs: [],
      citation_ids: [],
    })
    expect(events.find((event) => event.agent === 'Historian' && event.type === 'agent.started')?.title).toBe('Reviewing your scan history')
    expect(events.find((event) => event.agent === 'Historian' && event.type === 'agent.completed')).toMatchObject({
      title: 'Scan history reviewed',
      detail: history_review.summary,
    })
  })

  it('falls back to computed sentences when Skeptic did not accept the history description', async () => {
    const { dependency, handlers } = fixture(history_agents, undefined, history_only)
    dependency.specialists!.Gatekeeper = null
    handlers.Detective.mockResolvedValue(no_product)
    handlers.Historian.mockResolvedValue(complete(history_output))
    handlers.Skeptic.mockResolvedValue({ status: 'needs_review', output: { ...skeptic_review([]), status: 'needs_review' }, limitations: [] })

    const result = await run_consumer_workflow(request, { dependency })

    expect(result.status).toBe('needs_review')
    expect(result.explanation).toEqual({
      summary: '12 scans were found in the selected period (this month), but the patterns could not be described reliably.',
      reasons: [],
      tradeoffs: [],
      citation_ids: [],
    })
  })

  it('explains an insufficient history from computed values only', async () => {
    const { dependency, handlers } = fixture(history_agents, undefined, history_only)
    dependency.specialists!.Gatekeeper = null
    handlers.Detective.mockResolvedValue(no_product)
    handlers.Historian.mockResolvedValue({
      status: 'partial',
      output: {
        status: 'insufficient_history',
        time_window: { label: 'yesterday', from: '2026-10-07T00:00:00.000Z', to: '2026-10-08T00:00:00.000Z', time_zone: 'UTC' },
        focus: [],
        analysis: { status: 'insufficient_history', total_scans: 0, truncated: false, patterns: [], limitations: [] },
        review: null,
        limitations: [],
      },
      limitations: [],
    })

    const result = await run_consumer_workflow(request, { dependency })

    const summary = 'There are not enough scans in the selected period (yesterday) to show a pattern.'
    expect(result.assessments.find((assessment) => assessment.agent === 'Historian')?.summary).toBe(summary)
    expect(result.explanation).toEqual({ summary, reasons: [], tradeoffs: [], citation_ids: [] })
    // Nothing was described, so Skeptic had nothing to review.
    expect(handlers.Skeptic).not.toHaveBeenCalled()
  })

  it('still waits for the product when a history request names one that Detective cannot find', async () => {
    const { dependency, handlers } = fixture(history_agents, undefined, { ...history_only, product_named: true })
    dependency.specialists!.Gatekeeper = null
    handlers.Detective.mockResolvedValue(no_product)
    handlers.Historian.mockResolvedValue(complete(history_output))

    const result = await run_consumer_workflow(request, { dependency })

    expect(handlers.Skeptic).not.toHaveBeenCalled()
    expect(result.status).toBe('needs_input')
    expect(result.assessments.find((assessment) => assessment.agent === 'Detective')?.status).toBe('needs_input')
    expect(result.limitations).toContain(no_product.limitations[0]!)
  })

  it('does not infer authenticated context from workflow input', async () => {
    const { dependency, handlers } = fixture()
    const forged = { user_id: request.user_id, tenants: [{ tenant_id: 99, tenant_type: 'user', tenant_schema_version: 'forged' }] }
    const result = await run_consumer_workflow({ ...request, authenticated_payload: forged } as typeof request, { dependency })
    expect(result.status).toBe('completed')
    expect(handlers['Vault Keeper'].mock.calls[0]).toHaveLength(2)
    expect(JSON.stringify(result)).not.toContain('forged')
  })

  it('snapshots caller claims before asynchronous work begins', async () => {
    const { dependency, handlers } = fixture()
    const released = Promise.withResolvers<void>()
    dependency.bodyguard = mock(async () => {
      await released.promise
      return { safe: true, action: 'allow', riskLevel: 'none', risks: [], reason: 'Allowed', confidence: 1 }
    })
    const payload: lib_dto_payload = {
      user_id: request.user_id,
      tenants: [{ tenant_id: request.user_id, tenant_type: 'user', tenant_schema_version: 'original-version' }],
    }
    const running = run_consumer_workflow(request, { dependency, authenticated_payload: payload })
    payload.user_id = 99
    payload.tenants![0]!.tenant_schema_version = 'mutated-version'
    payload.tenants!.push({ tenant_id: 99, tenant_type: 'user', tenant_schema_version: 'injected-version' })
    released.resolve()
    expect((await running).status).toBe('completed')
    expect(handlers['Vault Keeper'].mock.calls[0]![2]?.payload).toEqual({
      user_id: request.user_id,
      tenants: [{ tenant_id: request.user_id, tenant_type: 'user', tenant_schema_version: 'original-version' }],
    })
  })

  it('isolates backend context for concurrent requests using shared adapters', async () => {
    const { dependency, handlers } = fixture()
    const both_started = Promise.withResolvers<void>()
    handlers['Vault Keeper'].mockImplementation(async () => {
      if (handlers['Vault Keeper'].mock.calls.length === 2) both_started.resolve()
      await both_started.promise
      return { ...complete(), permissions: { personalization: true, history: true } }
    })
    const results = await Promise.all(
      [7, 8].map((user_id) =>
        run_consumer_workflow(
          { ...request, user_id },
          {
            dependency,
            timeout_ms: 2000,
            authenticated_payload: {
              user_id,
              tenants: [{ tenant_id: user_id, tenant_type: 'user', tenant_schema_version: `private-user-${user_id}` }],
            },
          },
        ),
      ),
    )
    for (const result of results) expect(result.status).toBe('completed')
    for (const [input, , context] of handlers['Vault Keeper'].mock.calls) {
      expect(context?.payload.user_id).toBe(input.user_id!)
      expect(context?.payload.tenants).toEqual([
        { tenant_id: input.user_id!, tenant_type: 'user', tenant_schema_version: `private-user-${input.user_id}` },
      ])
    }
    expect(handlers['Vault Keeper'].mock.calls[0]![2]).not.toBe(handlers['Vault Keeper'].mock.calls[1]![2])
    expect(JSON.stringify(results)).not.toContain('private-user-')
  })

  it('rejects a mismatched authenticated identity before running any agent', async () => {
    const { dependency, handlers } = fixture()
    await expect(run_consumer_workflow(request, { dependency, authenticated_payload: { user_id: 99 } })).rejects.toMatchObject({ status: 401 })
    expect(dependency.bodyguard).not.toHaveBeenCalled()
    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled()
  })

  it('reports the missing clinical-risk check when requested Medic work has no adapter', async () => {
    const { dependency } = fixture()
    dependency.specialists = {}
    const result = await run_consumer_workflow(request, { dependency })

    expect(result.status).toBe('needs_review')
    expect(result.product).toBeNull()
    expect(result.assessments).toEqual([])
    expect(result.explanation).toBeNull()
    expect(result.limitations).toEqual([
      'No implemented specialist was selected for this request.',
      'Requested health assessment is incomplete: Medic was unavailable, so nutrition assessment, restriction check, and portion calculation did not run.',
    ])
    expect(result.limitations.join(' ')).not.toContain('is not implemented')
    expect(result).not.toHaveProperty('agent_results')
  })

  it('names only the Dispatcher-selected Medic scope when no Medic adapter is available', async () => {
    const { dependency } = fixture([...core, 'Medic'], ['restriction_check'])
    dependency.specialists = {}

    const result = await run_consumer_workflow(request, { dependency })

    expect(result.status).toBe('needs_review')
    expect(result.limitations).toContain('Requested health assessment is incomplete: Medic was unavailable, so restriction check did not run.')
    expect(result.limitations.join(' ')).not.toContain('nutrition assessment')
    expect(result.limitations.join(' ')).not.toContain('portion calculation')
  })

  it('keeps the result incomplete when Medic returns without completing the requested health assessment', async () => {
    const { dependency, handlers } = fixture()
    handlers.Medic.mockResolvedValue({
      status: 'needs_input',
      output: null,
      limitations: ['A verified product label is required for the health assessment.'],
    })

    const result = await run_consumer_workflow(request, { dependency })

    expect(result.status).toBe('needs_input')
    expect(result.limitations).toContain(
      'Requested health assessment is incomplete: Medic returned needs input, so nutrition assessment, restriction check, and portion calculation did not complete.',
    )
    expect(result.limitations).toContain('A verified product label is required for the health assessment.')
  })

  it('returns validated Detective and Investigator results without waiting for future agents', async () => {
    const { dependency, handlers } = fixture(core)
    handlers.Detective.mockResolvedValue(
      complete({
        status: 'identified',
        query_type: 'product',
        found: true,
        subject: {
          type: 'product',
          source: 'open_food_facts',
          name: 'Coca-Cola Original Taste',
          barcode: '5449000054227',
          brand_name: 'Coca-Cola',
          brand_candidates: ['Coca-Cola'],
        },
        selection: { required: false, options: [], total_options: 0 },
        related_products: { relation: 'none', items: [], total: 0, page: 1, page_size: 0, has_more: false },
        sources_checked: ['open_food_facts'],
        message: 'Product identified.',
      }),
    )
    handlers.Investigator.mockResolvedValue(
      complete({
        subject: {
          brand_name: 'Coca-Cola',
          brand_candidates: ['Coca-Cola'],
          product_name: 'Coca-Cola Original Taste',
        },
        status: 'evidence_found',
        checked_at: '2026-09-24T12:00:00.000Z',
        checks: [
          {
            source: 'local_knowledge',
            status: 'matched',
            decision_status: 'boycott',
            confidence: 100,
            reason: 'Listed by a cited campaign guide.',
            matched_entity: {
              entity_type: 'brand',
              name: 'Coca-Cola',
              matched_name: 'Coca-Cola',
              match_type: 'exact',
              match_score: 100,
            },
            matched_path: ['input:Coca-Cola', 'brand:Coca-Cola'],
            citations: [
              {
                source_name: 'Campaign guide',
                source_url: 'https://example.org',
                title: 'Brand evidence',
                url: 'https://example.org/evidence/coca-cola',
                quote: null,
              },
            ],
          },
        ],
        limitations: ['checked_at records lookup time, not the publication date or freshness of the underlying evidence.'],
        message: 'Sourced evidence was found; a separate review must assess its significance.',
        analysis_draft: null,
      }),
    )
    dependency.specialists = {
      Detective: handlers.Detective,
      Investigator: handlers.Investigator,
    }

    const result = await run_consumer_workflow(request, { dependency })

    expect(result.status).toBe('completed')
    expect(result.subject).toEqual({
      type: 'product',
      name: 'Coca-Cola Original Taste',
      barcode: '5449000054227',
      brand: 'Coca-Cola',
    })
    expect(result.outcome).toBe('evidence_found')
    expect(result.product).toEqual({
      barcode: '5449000054227',
      name: 'Coca-Cola Original Taste',
      brand: 'Coca-Cola',
      nutrition: null,
    })
    expect(result.assessments.map((assessment) => assessment.agent)).toEqual(['Detective', 'Investigator'])
    expect(result.assessments[1]?.summary).toContain('boycott for Coca-Cola, 100% confidence')
    expect(result.assessments[1]?.source_ids).toEqual(['investigator-source-1'])
    expect(result.explanation).toEqual({
      summary:
        'Boycott-related evidence was found for Coca-Cola Original Taste in the sources checked by Ztroop. This is sourced evidence rather than a final independent judgment.',
      reasons: ['Listed by a cited campaign guide.'],
      tradeoffs: ['checked_at records lookup time, not the publication date or freshness of the underlying evidence.'],
      citation_ids: ['investigator-source-1'],
    })
    expect(result.sources).toEqual([
      {
        id: 'investigator-source-1',
        provider: 'Campaign guide',
        url: 'https://example.org/evidence/coca-cola',
        retrieved_at: '2026-09-24T12:00:00.000Z',
      },
    ])
    expect(result.limitations.join(' ')).not.toContain('is not implemented')
    expect(handlers.Skeptic).not.toHaveBeenCalled()
    expect(handlers.Referee).not.toHaveBeenCalled()
    expect(handlers.Storyteller).not.toHaveBeenCalled()
    expect(handlers.Gatekeeper).not.toHaveBeenCalled()
  })

  it('runs both parallel groups, merges every result, and preserves sequential gates', async () => {
    const { dependency, handlers, calls, candidate_review } = fixture()
    const first = Promise.withResolvers<void>()
    const second = Promise.withResolvers<void>()
    let first_started = 0
    let second_started = 0
    for (const name of ['Detective', 'Vault Keeper'] as const) {
      const implementation = handlers[name].getMockImplementation()!
      handlers[name].mockImplementation(async (input, signal) => {
        if (++first_started === 2) first.resolve()
        await Promise.race([first.promise, new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))])
        return implementation(input, signal)
      })
    }
    for (const name of ['Medic', 'Investigator', 'Eco Scout', 'Historian'] as const) {
      const implementation = handlers[name].getMockImplementation()!
      handlers[name].mockImplementation(async (input, signal) => {
        expect(first_started).toBe(2)
        if (++second_started === 4) second.resolve()
        await Promise.race([
          second.promise,
          new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
        ])
        return implementation(input, signal)
      })
    }
    const result = await run_consumer_workflow(request, { dependency, timeout_ms: 2000 })
    expect(result.status).toBe('completed')
    expect(result.product?.name).toBe('Reviewed cereal')
    expect(second_started).toBe(4)
    expect(calls.slice(6)).toEqual(['Skeptic', 'Referee', 'Coach', 'Bargain Hunter', 'Candidate review', 'Storyteller', 'Gatekeeper'])
    expect(Object.keys(handlers.Skeptic.mock.calls[0]![0].dependencies).sort()).toEqual(
      ['Detective', 'Medic', 'Investigator', 'Eco Scout', 'Historian'].sort(),
    )
    expect(handlers.Medic.mock.calls[0]![0].dependencies['Vault Keeper']?.status).toBe('completed')
    expect(handlers['Vault Keeper'].mock.calls[0]![0].user_id).toBe(7)
    expect(handlers.Investigator.mock.calls[0]![0]).not.toHaveProperty('user_id')
    expect(handlers.Investigator.mock.calls[0]![0].dependencies).not.toHaveProperty('Vault Keeper')
    expect(handlers.Storyteller.mock.calls[0]![0].candidate_review?.status).toBe('completed')
    expect(candidate_review).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(result)).not.toContain('private-context')
  })

  it('runs the required investigation and no candidate review for a general request', async () => {
    const { dependency, handlers, candidate_review, calls } = fixture(core)
    const result = await run_consumer_workflow(request, { dependency })
    expect(result.status).toBe('completed')
    expect(calls).toEqual(core)
    expect(handlers.Investigator).toHaveBeenCalledTimes(1)
    expect(handlers['Vault Keeper']).not.toHaveBeenCalled()
    expect(candidate_review).not.toHaveBeenCalled()
  })

  it('skips every downstream slot after Bodyguard rejects a request', async () => {
    const { dependency, handlers, candidate_review } = fixture()
    dependency.bodyguard = mock(async () => ({ safe: false, action: 'block', riskLevel: 'high', risks: [], reason: 'Blocked', confidence: 1 }))
    const result = await run_consumer_workflow(request, { dependency })
    expect(result.status).toBe('blocked')
    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled()
    expect(candidate_review).not.toHaveBeenCalled()
  })

  it('leaves personal checks unresolved when Vault Keeper denies permission', async () => {
    const { dependency, handlers } = fixture()
    handlers['Vault Keeper'].mockResolvedValue({ ...complete({}), permissions: { personalization: false, history: false } })
    const result = await run_consumer_workflow(request, { dependency })
    expect(result.status).toBe('needs_review')
    expect(handlers.Historian).not.toHaveBeenCalled()
    expect(handlers.Coach).not.toHaveBeenCalled()
    expect(handlers.Gatekeeper).not.toHaveBeenCalled()
    expect(result.explanation).toBeNull()
  })

  it('stops dependent analysis for an ambiguous product and preserves Referee blocks', async () => {
    for (const [agent, status] of [
      ['Detective', 'needs_input'],
      ['Referee', 'blocked'],
    ] as const) {
      const { dependency, handlers } = fixture()
      handlers[agent].mockResolvedValue({ status, output: null, limitations: ['Unresolved or restricted.'] })
      const result = await run_consumer_workflow(request, { dependency })
      expect(result.status).toBe(status)
      expect(handlers.Coach).not.toHaveBeenCalled()
      expect(handlers.Gatekeeper).not.toHaveBeenCalled()
      if (agent === 'Detective') expect(handlers.Medic).not.toHaveBeenCalled()
    }
  })

  it('withholds alternatives until the candidate review adapter is connected', async () => {
    const { dependency, handlers } = fixture()
    dependency.candidate_review = null
    const result = await run_consumer_workflow(request, { dependency })
    expect(result.status).toBe('needs_review')
    expect(result.alternatives).toEqual([])
    expect(handlers.Storyteller).not.toHaveBeenCalled()
    expect(handlers.Gatekeeper).not.toHaveBeenCalled()
  })

  it('shares one tool budget between parallel agents', async () => {
    const { dependency, handlers, plan } = fixture()
    const tool = mock(async () => 'tool output')
    dependency.dispatcher = mock(async (input) => ({ ...plan(input), budgets: { ...plan(input).budgets, max_tool_calls: 1 } }))
    for (const name of ['Detective', 'Vault Keeper'] as const) {
      handlers[name].mockImplementation(async (input) => complete(await input.use_tool(tool)))
    }
    const result = await run_consumer_workflow(request, { dependency })
    expect(result.status).toBe('needs_review')
    expect(tool).toHaveBeenCalledTimes(1)
    expect(result.limitations.join(' ')).toContain('tool-call budget')
  })

  it('uses Bait Tester on demand and fails closed while its slot is empty', async () => {
    const { dependency, handlers } = fixture(core)
    handlers.Detective.mockImplementation(async (input) => complete(await input.inspect_content('untrusted text')))
    expect((await run_consumer_workflow(request, { dependency })).status).toBe('needs_review')
    const inspect = mock(async (_text: string, _signal: AbortSignal) => ({ usable: true, text: 'inspected facts' }))
    dependency.bait_tester = inspect
    expect((await run_consumer_workflow(request, { dependency })).status).toBe('completed')
    expect(inspect).toHaveBeenCalledWith('untrusted text', expect.any(AbortSignal))
    expect(inspect.mock.calls[0]?.length).toBe(2)
  })

  it('passes Gatekeeper feedback to Storyteller and caps repair attempts', async () => {
    for (const repaired of [true, false]) {
      const { dependency, handlers } = fixture(core)
      const approved = handlers.Gatekeeper.getMockImplementation()!
      handlers.Gatekeeper.mockImplementation(async (input, signal) =>
        repaired && handlers.Gatekeeper.mock.calls.length > 1
          ? approved(input, signal)
          : { status: 'repair_required', output: null, limitations: ['Repair the draft.'] },
      )
      const result = await run_consumer_workflow(request, { dependency })
      expect(result.status).toBe(repaired ? 'completed' : 'error')
      expect(handlers.Gatekeeper).toHaveBeenCalledTimes(2)
      expect(handlers.Storyteller).toHaveBeenCalledTimes(2)
      expect(handlers.Storyteller.mock.calls[1]![0].feedback?.status).toBe('repair_required')
    }
  })

  it('stops a stalled specialist at the Dispatcher deadline even if it ignores the signal', async () => {
    const { dependency, handlers, plan } = fixture(core)
    dependency.dispatcher = mock(async (input) => ({ ...plan(input), budgets: { ...plan(input).budgets, timeout_ms: 30 } }))
    const pending = Promise.withResolvers<consumer_step_result>()
    handlers.Detective.mockImplementation(async () => pending.promise)
    const result = await run_consumer_workflow(request, { dependency, timeout_ms: 2000 })
    expect(result.status).toBe('error')
    expect(result.limitations[0]).toContain('time limit during detective')
    expect(handlers.Detective.mock.calls[0]![1].aborted).toBe(true)
    expect(handlers.Detective).toHaveBeenCalledTimes(1)
    pending.resolve(complete())
    await Bun.sleep(10)
    expect(handlers.Skeptic).not.toHaveBeenCalled()
  })

  it('prevents further tool calls after a stalled tool consumes the deadline', async () => {
    const { dependency, handlers } = fixture(core)
    const pending = Promise.withResolvers<void>()
    const next_tool = mock(async () => 'must not run')
    handlers.Detective.mockImplementation(async (input) => {
      await input.use_tool(() => pending.promise)
      return complete(await input.use_tool(next_tool))
    })
    const result = await run_consumer_workflow(request, { dependency, timeout_ms: 50 })
    expect(result.status).toBe('error')
    pending.resolve()
    await Bun.sleep(10)
    expect(next_tool).not.toHaveBeenCalled()
    expect(handlers.Skeptic).not.toHaveBeenCalled()
  })

  it('propagates the Dispatcher deadline to a running specialist', async () => {
    const { dependency, handlers, plan } = fixture(core)
    dependency.dispatcher = mock(async (input) => ({ ...plan(input), budgets: { ...plan(input).budgets, timeout_ms: 50 } }))
    handlers.Detective.mockImplementation(async (_input, signal) => {
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve()
        else signal.addEventListener('abort', () => resolve(), { once: true })
      })
      signal.throwIfAborted()
      return complete()
    })
    const result = await run_consumer_workflow(request, { dependency, timeout_ms: 2000 })
    expect(result.status).toBe('error')
    expect(result.limitations[0]).toContain('time limit')
    expect(handlers.Skeptic).not.toHaveBeenCalled()
  })
})

describe('Review agents after an unresolved review', () => {
  it('runs Referee and Storyteller on a Skeptic review that needs review, keeping the result restrictive', async () => {
    const { dependency, handlers } = fixture(core)
    handlers.Skeptic.mockResolvedValue({ status: 'needs_review', output: { agent: 'Skeptic' }, limitations: ['Undated boycott evidence.'] })

    const result = await run_consumer_workflow(request, { dependency })

    expect(handlers.Referee).toHaveBeenCalledTimes(1)
    expect(handlers.Storyteller).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('needs_review')
  })

  it('runs Storyteller after a blocking Referee decision and keeps the block', async () => {
    const { dependency, handlers } = fixture(core)
    handlers.Referee.mockResolvedValue({ status: 'blocked', output: { agent: 'Referee' }, limitations: ['Hard constraint violated.'] })

    const result = await run_consumer_workflow(request, { dependency })

    expect(handlers.Storyteller).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('blocked')
  })

  it('still skips Referee and Storyteller when Skeptic could not review anything', async () => {
    const { dependency, handlers } = fixture(core)
    handlers.Skeptic.mockResolvedValue({ status: 'needs_input', output: null, limitations: ['No resolved identity.'] })

    const result = await run_consumer_workflow(request, { dependency })

    expect(handlers.Referee).not.toHaveBeenCalled()
    expect(handlers.Storyteller).not.toHaveBeenCalled()
    expect(result.status).toBe('needs_input')
  })
})
