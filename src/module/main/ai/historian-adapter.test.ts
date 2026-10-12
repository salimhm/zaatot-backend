import type { type_historian_analysis, type_schema_agent_historian } from '@agent/historian/historian.schema.agent'
import type { historian_adapter_dependency, historian_analyse } from '@ai/adapter/historian.adapter.ai'
import type { consumer_specialist_input } from '@ai/execution/execution-contract.ai'

import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'

import { adapter_historian } from '@ai/adapter/historian.adapter.ai'

import { service_scan_history } from '@module/user/scan-history/scan-history.service'

// Thursday 8 October 2026, 10:00 UTC.
const now = new Date('2026-10-08T10:00:00.000Z')

const backend_context = {
  payload: { user_id: 7, tenants: [{ tenant_id: 7, tenant_type: 'user' as const, tenant_schema_version: 'user-schema-v1' }] },
}

const input = (history = true, time_zone?: string): consumer_specialist_input => ({
  prompt: 'Am I scanning healthier products this month?',
  ...(time_zone ? { time_zone } : {}),
  execution_id: crypto.randomUUID(),
  dependencies: {
    'Vault Keeper': { status: 'completed', output: null, limitations: [], permissions: { personalization: true, history } },
  },
  candidate_review: null,
  budgets: {
    timeout_ms: 10_000,
    max_tool_calls: 4,
    max_retries: 0,
    max_alternative_candidates: 0,
    max_candidate_review_passes: 0,
    max_response_repairs: 0,
  },
  use_tool: async (call) => await call(),
  inspect_content: async (text) => text,
})

const stored_scan = {
  scan_history_id: 1,
  product_id: 1,
  product_barcode: '5449000054227',
  scanned_at: '2026-10-02T08:00:00.000Z',
  product: {
    product_id: 1,
    product_barcode: '5449000054227',
    product_type: 'food',
    product_name: 'Example Cola 330 ml',
    product_nova_group: 4,
    product_ecoscore: null,
    product_nutriscore: 'e',
    brand_name: 'Example Cola',
  },
}

const analysis: type_historian_analysis = {
  status: 'available',
  total_scans: 1,
  truncated: false,
  patterns: [{ id: 'nutriscore_distribution', kind: 'grade_distribution', values: { e: 1 } }],
  limitations: [],
}

const review: type_schema_agent_historian = {
  status: 'available',
  summary: 'This month you scanned 1 product, with Nutri-Score E.',
  findings: [{ pattern_id: 'nutriscore_distribution', statement: 'The product you scanned had Nutri-Score E.' }],
  limitations: ['Window: this month.'],
}

const this_month = {
  period: { type: 'calendar' as const, unit: 'month' as const, offset: 0 as const, count: null, from: null, to: null },
  focus: ['nutriscore' as const],
}

const dependency = (overrides: Partial<historian_adapter_dependency> = {}) => {
  const read_request = mock<NonNullable<historian_adapter_dependency['read_request']>>(async () => ({ success: true as const, data: this_month }))
  const analyse = mock<historian_analyse>(() => analysis)
  const review_agent = mock<NonNullable<historian_adapter_dependency['review']>>(async () => ({ success: true as const, data: review }))
  return {
    read_request,
    analyse,
    review: review_agent,
    deps: { read_request, analyse, review: review_agent, now: () => now, ...overrides } as historian_adapter_dependency,
  }
}

afterEach(() => {
  mock.restore()
})

describe('Historian adapter', () => {
  it('reads, analyzes and describes the permitted history for the requested window', async () => {
    const find_window = spyOn(service_scan_history, 'find_window').mockResolvedValue({ scans: [stored_scan], total: 1 })
    const { deps, read_request, analyse, review: review_agent } = dependency()

    const result = await adapter_historian(deps)(input(), new AbortController().signal, backend_context)

    expect(read_request.mock.calls[0]![0]).toEqual({
      question: 'Am I scanning healthier products this month?',
      today: '2026-10-08',
      weekday: 'Thursday',
      time_zone: 'UTC',
      week_start: 'Monday',
    })
    expect(find_window).toHaveBeenCalledWith(
      { from: '2026-10-01T00:00:00.000Z', to: '2026-10-08T10:00:00.000Z', limit: 500 },
      { user_id: 7, tenants: backend_context.payload.tenants },
    )
    expect(analyse.mock.calls[0]![0]).toMatchObject({ focus: ['nutriscore'], window: { kind: 'this_month' }, scans: { total: 1 } })
    expect(review_agent.mock.calls[0]![0]).toMatchObject({
      question: 'Am I scanning healthier products this month?',
      analysis,
      window: { label: 'this month' },
    })
    expect(result).toEqual({
      status: 'completed',
      output: {
        status: 'available',
        time_window: { label: 'this month', from: '2026-10-01T00:00:00.000Z', to: '2026-10-08T10:00:00.000Z', time_zone: 'UTC' },
        focus: ['nutriscore'],
        analysis,
        review,
        limitations: [
          'Periods were calculated in UTC because the user’s time zone is not available.',
          'Scans show which products were looked up in Zaatot, not what was bought or consumed.',
        ],
      },
      limitations: [
        'Periods were calculated in UTC because the user’s time zone is not available.',
        'Scans show which products were looked up in Zaatot, not what was bought or consumed.',
      ],
    })
  })

  it('resolves the period in the client time zone', async () => {
    const find_window = spyOn(service_scan_history, 'find_window').mockResolvedValue({ scans: [], total: 0 })
    const { deps, read_request } = dependency({ analyse: () => ({ ...analysis, status: 'insufficient_history', total_scans: 0, patterns: [] }) })

    const result = await adapter_historian(deps)(input(true, 'Asia/Tokyo'), new AbortController().signal, backend_context)

    // 10:00 UTC is 19:00 in Tokyo, and this month starts at local midnight on 1 October (15:00 UTC the day before).
    expect(read_request.mock.calls[0]![0]).toMatchObject({ today: '2026-10-08', weekday: 'Thursday', time_zone: 'Asia/Tokyo' })
    expect(find_window.mock.calls[0]![0]).toMatchObject({ from: '2026-09-30T15:00:00.000Z', to: '2026-10-08T10:00:00.000Z' })
    expect(result.output).toMatchObject({ time_window: { time_zone: 'Asia/Tokyo' } })
    expect(result.limitations).not.toContain('Periods were calculated in UTC because the user’s time zone is not available.')
  })

  it('falls back to UTC with a note for an unknown time zone', async () => {
    spyOn(service_scan_history, 'find_window').mockResolvedValue({ scans: [], total: 0 })
    const { deps, read_request } = dependency({ analyse: () => ({ ...analysis, status: 'insufficient_history', total_scans: 0, patterns: [] }) })

    const result = await adapter_historian(deps)(input(true, 'Mars/Olympus_Mons'), new AbortController().signal, backend_context)

    expect(read_request.mock.calls[0]![0]).toMatchObject({ time_zone: 'UTC' })
    expect(result.output).toMatchObject({ time_window: { time_zone: 'UTC' } })
    expect(result.limitations).toContain('Unknown time zone "Mars/Olympus_Mons"; UTC was used instead.')
  })

  it('blocks without verified identity and reads nothing', async () => {
    const find_window = spyOn(service_scan_history, 'find_window')
    const { deps, read_request } = dependency()

    const result = await adapter_historian(deps)(input(), new AbortController().signal)

    expect(result).toMatchObject({ status: 'blocked', output: { status: 'not_permitted', analysis: null } })
    expect(read_request).not.toHaveBeenCalled()
    expect(find_window).not.toHaveBeenCalled()
  })

  it('asks for permission when Vault Keeper did not allow history and reads nothing', async () => {
    const find_window = spyOn(service_scan_history, 'find_window')
    const { deps, read_request } = dependency()

    const result = await adapter_historian(deps)(input(false), new AbortController().signal, backend_context)

    expect(result).toMatchObject({
      status: 'needs_input',
      output: { status: 'not_permitted' },
      limitations: ['Permission to use scan history is unavailable for this request.'],
    })
    expect(read_request).not.toHaveBeenCalled()
    expect(find_window).not.toHaveBeenCalled()
  })

  it('uses the default window when the question cannot be read', async () => {
    const find_window = spyOn(service_scan_history, 'find_window').mockResolvedValue({ scans: [], total: 0 })
    const { deps } = dependency({ read_request: async () => ({ success: false as const, data: new Error('model failed') }) })

    const result = await adapter_historian(deps)(input(), new AbortController().signal, backend_context)

    expect(find_window.mock.calls[0]![0]).toMatchObject({ from: '2026-09-09T00:00:00.000Z', to: '2026-10-08T10:00:00.000Z' })
    expect(result.output).toMatchObject({ focus: [], time_window: { label: 'last 30 days' } })
    expect(result.limitations).toContain('The requested period could not be read, so the default window was used.')
  })

  it('does not call the model for an insufficient history', async () => {
    spyOn(service_scan_history, 'find_window').mockResolvedValue({ scans: [], total: 0 })
    const insufficient = { ...analysis, status: 'insufficient_history' as const, total_scans: 0, patterns: [] }
    const { deps, review: review_agent } = dependency({ analyse: () => insufficient })

    const result = await adapter_historian(deps)(input(), new AbortController().signal, backend_context)

    expect(result).toMatchObject({ status: 'partial', output: { status: 'insufficient_history', analysis: insufficient, review: null } })
    expect(review_agent).not.toHaveBeenCalled()
  })

  it('keeps the computed analysis but drops a description that failed validation', async () => {
    spyOn(service_scan_history, 'find_window').mockResolvedValue({ scans: [stored_scan], total: 1 })
    const { deps } = dependency({ review: async () => ({ success: false as const, data: new Error('cited an unknown pattern') }) })

    const result = await adapter_historian(deps)(input(), new AbortController().signal, backend_context)

    expect(result).toMatchObject({ status: 'partial', output: { status: 'available', analysis, review: null } })
    expect(result.limitations).toContain('The computed patterns could not be described reliably, so no description is included.')
  })

  it('reports when only the most recent scans were analyzed', async () => {
    spyOn(service_scan_history, 'find_window').mockResolvedValue({ scans: [stored_scan], total: 900 })
    const { deps } = dependency()

    const result = await adapter_historian(deps)(input(), new AbortController().signal, backend_context)

    expect(result.limitations).toContain('Only the 1 most recent of 900 scans in this window were analyzed.')
  })

  it('fails instead of publishing an analysis that breaks its contract', async () => {
    spyOn(service_scan_history, 'find_window').mockResolvedValue({ scans: [stored_scan], total: 1 })
    const { deps, review: review_agent } = dependency({ analyse: () => ({ status: 'available' }) as never })

    await expect(adapter_historian(deps)(input(), new AbortController().signal, backend_context)).rejects.toThrow()
    expect(review_agent).not.toHaveBeenCalled()
  })

  it('stops when the workflow is cancelled', async () => {
    const find_window = spyOn(service_scan_history, 'find_window')
    const controller = new AbortController()
    controller.abort()
    const { deps, read_request } = dependency()

    await expect(adapter_historian(deps)(input(), controller.signal, backend_context)).rejects.toThrow()
    expect(read_request).not.toHaveBeenCalled()
    expect(find_window).not.toHaveBeenCalled()
  })
})
