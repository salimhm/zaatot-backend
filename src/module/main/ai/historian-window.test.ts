import type { historian_period } from '@ai/utils.ai'

import { describe, expect, it } from 'bun:test'

import { resolve_historian_window } from '@ai/utils.ai'

// Wednesday 7 October 2026, 10:00 UTC.
const now = new Date('2026-10-07T10:00:00.000Z')
const empty: historian_period = { type: 'none', unit: null, offset: null, count: null, from: null, to: null }
const period = (value: Partial<historian_period>): historian_period => ({ ...empty, ...value })
const resolve = (value: Partial<historian_period>, time_zone = 'UTC') => resolve_historian_window(period(value), { now, time_zone })

describe('resolve_historian_window', () => {
  it.each([
    ['day', 0, 'today', '2026-10-07T00:00:00.000Z', '2026-10-07T10:00:00.000Z'],
    ['day', -1, 'yesterday', '2026-10-06T00:00:00.000Z', '2026-10-07T00:00:00.000Z'],
    ['week', 0, 'this_week', '2026-10-05T00:00:00.000Z', '2026-10-07T10:00:00.000Z'],
    ['week', -1, 'last_week', '2026-09-28T00:00:00.000Z', '2026-10-05T00:00:00.000Z'],
    ['month', 0, 'this_month', '2026-10-01T00:00:00.000Z', '2026-10-07T10:00:00.000Z'],
    ['month', -1, 'last_month', '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'],
    ['year', 0, 'this_year', '2026-01-01T00:00:00.000Z', '2026-10-07T10:00:00.000Z'],
    ['year', -1, 'last_year', '2025-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  ] as const)('resolves calendar %p with offset %p', (unit, offset, kind, from, to) => {
    expect(resolve({ type: 'calendar', unit, offset })).toMatchObject({ kind, from, to, defaulted: false, capped: false, notes: [] })
  })

  it.each([
    ['day', 7, 'last 7 days', '2026-10-01T00:00:00.000Z'],
    ['week', 2, 'last 2 weeks', '2026-09-24T00:00:00.000Z'],
    ['month', 1, 'last 1 month', '2026-09-08T00:00:00.000Z'],
    ['month', 3, 'last 3 months', '2026-07-08T00:00:00.000Z'],
    ['hour', 24, 'last 24 hours', '2026-10-06T10:00:00.000Z'],
  ] as const)('resolves rolling %p × %p ending now', (unit, count, label, from) => {
    expect(resolve({ type: 'rolling', unit, count })).toMatchObject({ kind: 'rolling', label, from, to: now.toISOString() })
  })

  it('resolves a period that starts on a date', () => {
    expect(resolve({ type: 'since', from: '2026-09-15' })).toMatchObject({
      kind: 'since',
      label: 'since 15 September 2026',
      from: '2026-09-15T00:00:00.000Z',
      to: now.toISOString(),
    })
  })

  it('resolves inclusive date ranges, including reversed ones', () => {
    const expected = {
      kind: 'range',
      label: '1 September 2026 to 10 September 2026',
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-11T00:00:00.000Z',
    }
    expect(resolve({ type: 'range', from: '2026-09-01', to: '2026-09-10' })).toMatchObject(expected)
    expect(resolve({ type: 'range', from: '2026-09-10', to: '2026-09-01' })).toMatchObject(expected)
  })

  it('keeps a full leap year without capping it', () => {
    expect(resolve({ type: 'range', from: '2024-01-01', to: '2024-12-31' })).toMatchObject({
      from: '2024-01-01T00:00:00.000Z',
      to: '2025-01-01T00:00:00.000Z',
      capped: false,
    })
  })

  it('bounds an open-start range with the window cap', () => {
    expect(resolve({ type: 'range', from: null, to: '2026-04-30' })).toMatchObject({
      kind: 'range',
      label: 'until 30 April 2026',
      from: '2025-04-30T00:00:00.000Z',
      to: '2026-05-01T00:00:00.000Z',
      capped: true,
    })
  })

  it('never ends a window in the future', () => {
    expect(resolve({ type: 'range', from: '2026-10-01', to: '2026-12-31' })).toMatchObject({
      from: '2026-10-01T00:00:00.000Z',
      to: now.toISOString(),
    })
  })

  it('caps long periods at 366 days', () => {
    const notes = ['History is limited to the most recent 366 days of the requested period.']
    expect(resolve({ type: 'all_time' })).toMatchObject({ kind: 'all_time', capped: true, from: '2025-10-06T10:00:00.000Z', notes })
    expect(resolve({ type: 'rolling', unit: 'year', count: 2 })).toMatchObject({ kind: 'rolling', capped: true, from: '2025-10-06T10:00:00.000Z' })
  })

  it('uses the user time zone for calendar boundaries', () => {
    // 02:00 on 7 October in Dubai (UTC+4) is still 6 October in UTC.
    const late = new Date('2026-10-06T22:00:00.000Z')
    expect(resolve_historian_window(period({ type: 'calendar', unit: 'day', offset: 0 }), { now: late, time_zone: 'Asia/Dubai' })).toMatchObject({
      from: '2026-10-06T20:00:00.000Z',
      to: late.toISOString(),
      time_zone: 'Asia/Dubai',
    })
  })

  it('handles daylight saving changes inside the window', () => {
    // New York switches from EST (UTC-5) to EDT (UTC-4) on 8 March 2026.
    expect(resolve({ type: 'range', from: '2026-03-01', to: '2026-03-31' }, 'America/New_York')).toMatchObject({
      from: '2026-03-01T05:00:00.000Z',
      to: '2026-04-01T04:00:00.000Z',
    })
  })

  it('falls back to the last 30 days when no period is given', () => {
    expect(resolve({ type: 'none' })).toMatchObject({
      kind: 'default',
      label: 'last 30 days',
      from: '2026-09-08T00:00:00.000Z',
      to: now.toISOString(),
      defaulted: true,
      notes: [],
    })
  })

  it.each([
    [
      { type: 'calendar', unit: 'hour', offset: 0 },
      'The requested calendar period needs a day, week, month or year and whether it is the current or previous one.',
    ],
    [
      { type: 'calendar', unit: 'week', offset: null },
      'The requested calendar period needs a day, week, month or year and whether it is the current or previous one.',
    ],
    [{ type: 'rolling', unit: 'day', count: null }, 'The requested rolling period needs a unit and a count.'],
    [{ type: 'since', from: null }, 'The requested start date is missing or not a valid calendar date.'],
    [{ type: 'range', from: '2026-09-01', to: null }, 'The requested end date is missing or not a valid calendar date.'],
    [{ type: 'since', from: '2026-12-01' }, 'The requested period (since 1 December 2026) has not started yet.'],
    [{ type: 'range', from: '2027-01-01', to: '2027-12-31' }, 'The requested period (1 January 2027 to 31 December 2027) has not started yet.'],
  ] as const)('falls back with a note for an unusable period %#', (value, note) => {
    expect(resolve(value as Partial<historian_period>)).toMatchObject({ kind: 'default', defaulted: true, notes: [note] })
  })

  it.each([
    ['not an object', 'last week'],
    ['an unknown type', { ...empty, type: 'fortnight' }],
    ['an invalid date', { ...empty, type: 'since', from: '2026-02-30' }],
    ['a zero count', { ...empty, type: 'rolling', unit: 'day', count: 0 }],
  ])('falls back when model output is %s', (_, value) => {
    expect(resolve_historian_window(value, { now })).toMatchObject({
      kind: 'default',
      defaulted: true,
      notes: ['The requested period could not be understood.'],
    })
  })

  it('falls back to UTC for an unknown time zone', () => {
    expect(resolve({ type: 'calendar', unit: 'day', offset: 0 }, 'Mars/Olympus')).toMatchObject({
      time_zone: 'UTC',
      from: '2026-10-07T00:00:00.000Z',
      notes: ['Unknown time zone "Mars/Olympus"; UTC was used instead.'],
    })
  })
})
