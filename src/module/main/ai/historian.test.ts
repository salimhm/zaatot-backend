import type { type_input_agent_historian, type_schema_agent_historian } from '@agent/historian/historian.schema.agent'

import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'

import { historian_local_context } from '@ai/utils.ai'
import { $agent_historian, $agent_historian_request, agent_historian, agent_historian_request } from '@agent/historian/historian.agent'
import { prompt_agent_historian_request } from '@agent/historian/historian.prompt.agent'
import { schema_agent_historian_request } from '@agent/historian/historian.schema.agent'

type generated = Awaited<ReturnType<typeof $agent_historian.generateText>>

afterEach(() => {
  mock.restore()
})

const request_input = {
  question: 'شنو سكانيت هاد الشهر؟',
  today: '2026-10-08',
  weekday: 'Thursday' as const,
  time_zone: 'Africa/Casablanca',
  week_start: 'Monday' as const,
}

const this_month = {
  period: { type: 'calendar' as const, unit: 'month' as const, offset: 0 as const, count: null, from: null, to: null },
  focus: ['products' as const],
}

const review_input: type_input_agent_historian = {
  question: 'Am I scanning healthier products this month?',
  window: {
    label: 'this month',
    from: '2026-10-01T00:00:00.000Z',
    to: '2026-10-08T10:00:00.000Z',
    time_zone: 'UTC',
    defaulted: false,
    capped: false,
    notes: [],
  },
  analysis: {
    status: 'available',
    total_scans: 12,
    truncated: false,
    patterns: [
      { id: 'nutriscore_distribution', kind: 'grade_distribution', values: { a: 2, b: 1, c: 3, d: 2, e: 4, missing: 0 } },
      { id: 'nutriscore_trend', kind: 'trend', values: { direction: 'none', significant: false } },
    ],
    limitations: [],
  },
}

const review: type_schema_agent_historian = {
  status: 'available',
  summary: 'This month you scanned 12 products; 4 had Nutri-Score E.',
  findings: [{ pattern_id: 'nutriscore_distribution', statement: '4 of the 12 products you scanned had Nutri-Score E.' }],
  limitations: ['Window: this month.', 'Scans are not proof of purchase or consumption.'],
}

describe('Historian request reader', () => {
  it('sends the question with its local calendar context and returns the structured period', async () => {
    const generate = spyOn($agent_historian_request, 'generateText').mockResolvedValue({ output: this_month } as generated)

    expect(await agent_historian_request(request_input)).toEqual({ success: true, data: this_month })
    expect(JSON.parse(generate.mock.calls[0]![0] as string)).toEqual(request_input)
  })

  it('reports invalid model output as a failure', async () => {
    spyOn($agent_historian_request, 'generateText').mockResolvedValue({ output: { period: { type: 'fortnight' }, focus: [] } } as generated)

    expect((await agent_historian_request(request_input)).success).toBe(false)
  })

  it('does not call the model for invalid input or after cancellation', async () => {
    const generate = spyOn($agent_historian_request, 'generateText')
    const controller = new AbortController()
    controller.abort()

    expect((await agent_historian_request({ ...request_input, today: '08/10/2026' })).success).toBe(false)
    expect((await agent_historian_request(request_input, controller.signal)).success).toBe(false)
    expect(generate).not.toHaveBeenCalled()
  })

  it('ships only examples that match the request schema', () => {
    const examples = prompt_agent_historian_request.split('\n').filter((line) => line.startsWith('{"period"'))
    expect(examples.length).toBeGreaterThanOrEqual(10)
    for (const example of examples) expect(schema_agent_historian_request.safeParse(JSON.parse(example)).success).toBe(true)
  })
})

describe('Historian review', () => {
  it('returns a review that cites computed patterns', async () => {
    const generate = spyOn($agent_historian, 'generateText').mockResolvedValue({ output: review } as generated)

    expect(await agent_historian(review_input)).toEqual({ success: true, data: review })
    expect(JSON.parse(generate.mock.calls[0]![0] as string)).toEqual(review_input)
  })

  it.each([
    ['an unknown pattern', { ...review, findings: [{ pattern_id: 'sugar_average', statement: 'Your average sugar fell.' }] }],
    ['the same pattern twice', { ...review, findings: [...review.findings, { pattern_id: 'nutriscore_distribution', statement: 'Again.' }] }],
    ['a status that differs from the analysis', { ...review, status: 'insufficient_history', findings: [] }],
  ])('rejects a review that cites %s', async (_, output) => {
    spyOn($agent_historian, 'generateText').mockResolvedValue({ output } as generated)

    expect((await agent_historian(review_input)).success).toBe(false)
  })

  it('rejects findings when the history is insufficient', async () => {
    const insufficient = { ...review_input, analysis: { ...review_input.analysis, status: 'insufficient_history' as const, total_scans: 2 } }
    spyOn($agent_historian, 'generateText').mockResolvedValue({ output: { ...review, status: 'insufficient_history' } } as generated)
    expect((await agent_historian(insufficient)).success).toBe(false)

    const empty = { ...review, status: 'insufficient_history' as const, findings: [] }
    spyOn($agent_historian, 'generateText').mockResolvedValue({ output: empty } as generated)
    expect(await agent_historian(insufficient)).toEqual({ success: true, data: empty })
  })
})

describe('historian_local_context', () => {
  it('gives the local date and weekday in the user time zone', () => {
    // 01:00 on Friday 9 October in Dubai is still Thursday 8 October in UTC.
    expect(historian_local_context({ now: new Date('2026-10-08T21:00:00.000Z'), time_zone: 'Asia/Dubai' })).toEqual({
      today: '2026-10-09',
      weekday: 'Friday',
      time_zone: 'Asia/Dubai',
      week_start: 'Monday',
    })
  })

  it('falls back to UTC for an unknown time zone', () => {
    expect(historian_local_context({ now: new Date('2026-10-08T21:00:00.000Z'), time_zone: 'Mars/Olympus' })).toMatchObject({
      today: '2026-10-08',
      weekday: 'Thursday',
      time_zone: 'UTC',
    })
  })
})
