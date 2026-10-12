import type { type_historian_analysis } from '@agent/historian/historian.schema.agent'
import type { type_tool_historian_scan_history_scan } from '@tool/historian-scan-history/historian-scan-history.dto.tool'

import { describe, expect, it } from 'bun:test'

import { finalize_historian_review } from '@agent/historian/historian.agent'
import { analyse_historian_result, tool_historian_analyse_result } from '@tool/historian-analyse-result/historian-analyse-result.tool'

const window = { from: '2026-09-08T00:00:00.000Z', to: '2026-10-08T10:00:00.000Z' }

type product_overrides = Partial<NonNullable<type_tool_historian_scan_history_scan['product']>>

let next_id = 1
const scan = (scanned_at: string, barcode = '5449000054227', product: product_overrides | null = {}): type_tool_historian_scan_history_scan => ({
  scan_history_id: next_id++,
  scanned_at,
  barcode,
  product:
    product === null
      ? null
      : {
          product_id: Number(barcode.slice(-4)) || 1,
          barcode,
          name: `Product ${barcode}`,
          brand_name: 'Example Cola',
          type: 'food',
          nutriscore: 'e',
          ecoscore: null,
          nova_group: 4,
          ...product,
        },
})

const history = (scans: type_tool_historian_scan_history_scan[], total = scans.length) => ({
  window,
  scans,
  total,
  truncated: total > scans.length,
})

// One scan per day from 10 September, oldest first.
const day = (index: number, hour = 8) => new Date(Date.UTC(2026, 8, 10 + index, hour)).toISOString()

const pattern = (analysis: type_historian_analysis, id: string) => analysis.patterns.find((item) => item.id === id)?.values

describe('Historian analyse result', () => {
  it('reports an empty window as insufficient history without patterns', () => {
    expect(analyse_historian_result({ scans: history([]), focus: [], time_zone: 'UTC' })).toEqual({
      status: 'insufficient_history',
      total_scans: 0,
      truncated: false,
      patterns: [],
      limitations: [],
    })
  })

  it('counts scans, distinct and repeated products, and local active days', () => {
    const scans = [
      scan('2026-09-10T08:00:00.000Z', '1111111111111'),
      scan('2026-09-10T22:30:00.000Z', '1111111111111'),
      scan('2026-09-11T09:00:00.000Z', '2222222222222'),
    ]

    const utc = analyse_historian_result({ scans: history(scans, 900), focus: ['scan_count'], time_zone: 'UTC' })
    // The first two scans share 10 September in UTC, but 22:30 UTC is already 11 September in Tokyo (UTC+9).
    const same_day = history(scans.slice(0, 2))
    const days = (time_zone: string) =>
      pattern(analyse_historian_result({ scans: same_day, focus: ['scan_count'], time_zone }), 'scan_count')?.active_days

    expect(utc.patterns).toHaveLength(1)
    expect(utc).toMatchObject({ status: 'available', total_scans: 900, truncated: true })
    expect(pattern(utc, 'scan_count')).toEqual({
      total_scans: 900,
      analyzed_scans: 3,
      distinct_products: 2,
      repeated_products: 1,
      active_days: 2,
      missing_product_records: 0,
      first_scan_at: '2026-09-10T08:00:00.000Z',
      last_scan_at: '2026-09-11T09:00:00.000Z',
    })
    expect(days('UTC')).toBe(1)
    expect(days('Asia/Tokyo')).toBe(2)
  })

  it('ranks products and brands by scans, breaking ties by the most recent scan', () => {
    const scans = [
      scan(day(0), '1111111111111', { brand_name: 'Alpha', name: 'Old name' }),
      scan(day(1), '2222222222222', { brand_name: 'beta' }),
      scan(day(2), '1111111111111', { brand_name: 'ALPHA', name: 'New name' }),
      scan(day(3), '3333333333333', { brand_name: 'Beta' }),
      scan(day(4), '4444444444444', { brand_name: null }),
    ]

    const analysis = analyse_historian_result({ scans: history(scans), focus: ['products', 'brands'], time_zone: 'UTC' })

    expect(analysis.patterns.map((item) => item.id)).toEqual(['scan_count', 'top_products', 'top_brands'])
    expect(pattern(analysis, 'top_products')).toMatchObject({
      distinct_products: 4,
      listed: 4,
      rank_1_name: 'New name',
      rank_1_brand: 'ALPHA',
      rank_1_barcode: '1111111111111',
      rank_1_scans: 2,
      rank_2_barcode: '4444444444444',
      rank_3_barcode: '3333333333333',
      rank_4_barcode: '2222222222222',
    })
    expect(pattern(analysis, 'top_brands')).toEqual({
      distinct_brands: 2,
      listed: 2,
      rank_1_brand: 'Beta',
      rank_1_scans: 2,
      rank_2_brand: 'ALPHA',
      rank_2_scans: 2,
      scans_without_brand: 1,
    })
  })

  it('lists at most five products', () => {
    const scans = Array.from({ length: 8 }, (_, index) => scan(day(index), String(1_000_000_000_000 + index)))

    const values = pattern(analyse_historian_result({ scans: history(scans), focus: ['products'], time_zone: 'UTC' }), 'top_products')

    expect(values).toMatchObject({ distinct_products: 8, listed: 5 })
    expect(values).not.toHaveProperty('rank_6_barcode')
  })

  it('computes grade distributions, keeping missing grades separate', () => {
    const scans = [
      scan(day(0), '1111111111111', { nutriscore: 'a', ecoscore: 'b', nova_group: 1 }),
      scan(day(1), '2222222222222', { nutriscore: 'b', ecoscore: null, nova_group: 4 }),
      scan(day(2), '3333333333333', { nutriscore: 'e', ecoscore: 'd', nova_group: null }),
      scan(day(3), '4444444444444', null),
    ]

    const analysis = analyse_historian_result({ scans: history(scans), focus: ['nutriscore', 'ecoscore', 'nova_group'], time_zone: 'UTC' })

    expect(pattern(analysis, 'nutriscore_distribution')).toEqual({
      a: 1,
      b: 1,
      c: 0,
      d: 0,
      e: 1,
      unknown: 1,
      graded_scans: 3,
      share_a_or_b_percent: 66.7,
      share_d_or_e_percent: 33.3,
    })
    expect(pattern(analysis, 'ecoscore_distribution')).toMatchObject({ b: 1, d: 1, unknown: 2, graded_scans: 2, share_a_or_b_percent: 50 })
    expect(pattern(analysis, 'nova_group_distribution')).toEqual({
      nova_1: 1,
      nova_2: 0,
      nova_3: 0,
      nova_4: 1,
      unknown: 2,
      graded_scans: 2,
      share_nova_4_percent: 50,
    })
    expect(analysis.limitations).toContain('Grades are the ones saved when each product was first scanned and may differ from current product data.')
    expect(analysis.limitations).toContain('1 scan refer to a product with no stored record, so they have no name, brand, or grades.')
  })

  it('reports no clear change when there are too few graded scans in each half', () => {
    const scans = [
      scan(day(0), '1', { nutriscore: 'e' }),
      scan(day(1), '2', { nutriscore: 'e' }),
      scan(day(2), '3', { nutriscore: 'a' }),
      scan(day(3), '4', { nutriscore: 'a' }),
    ]

    const values = pattern(analyse_historian_result({ scans: history(scans), focus: ['nutriscore'], time_zone: 'UTC' }), 'nutriscore_comparison')

    expect(values).toEqual({
      metric: 'share_a_or_b_percent',
      split_at: day(2),
      earlier_graded_scans: 2,
      later_graded_scans: 2,
      earlier_percent: 0,
      later_percent: 100,
      change_points: 100,
      enough_scans: false,
      clear_change: false,
      direction: 'no_clear_change',
    })
  })

  it('reports a clear change only when it is significant', () => {
    const grades = (earlier: ('a' | 'e')[], later: ('a' | 'e')[]) =>
      [...earlier, ...later].map((nutriscore, index) => scan(day(index), String(1_000_000 + index), { nutriscore }))
    const compare = (scans: type_tool_historian_scan_history_scan[]) =>
      pattern(analyse_historian_result({ scans: history(scans), focus: ['nutriscore'], time_zone: 'UTC' }), 'nutriscore_comparison')

    const improved = compare(grades(Array(10).fill('e'), Array(10).fill('a')))
    const noisy = compare(grades(['a', 'e', 'e', 'e', 'e', 'e'], ['a', 'a', 'e', 'e', 'e', 'e']))
    const same = compare(grades(Array(6).fill('a'), Array(6).fill('a')))

    expect(improved).toMatchObject({ enough_scans: true, clear_change: true, direction: 'increased', change_points: 100 })
    expect(noisy).toMatchObject({ enough_scans: true, clear_change: false, direction: 'no_clear_change' })
    expect(same).toMatchObject({ enough_scans: true, clear_change: false, direction: 'no_clear_change', change_points: 0 })
  })

  it('omits a comparison with fewer than two graded scans', () => {
    const analysis = analyse_historian_result({ scans: history([scan(day(0))]), focus: ['nutriscore'], time_zone: 'UTC' })

    expect(analysis.patterns.map((item) => item.id)).toEqual(['scan_count', 'nutriscore_distribution'])
    expect(analysis.limitations).not.toContainEqual(expect.stringContaining('earlier and later half'))
  })

  it('includes every pattern for a general overview', () => {
    const scans = Array.from({ length: 4 }, (_, index) => scan(day(index), String(1_000_000 + index), { ecoscore: 'c' }))

    const analysis = analyse_historian_result({ scans: history(scans), focus: [], time_zone: 'UTC' })

    expect(analysis.patterns.map((item) => item.id)).toEqual([
      'scan_count',
      'top_products',
      'top_brands',
      'nutriscore_distribution',
      'nutriscore_comparison',
      'ecoscore_distribution',
      'ecoscore_comparison',
      'nova_group_distribution',
      'nova_group_comparison',
    ])
  })

  it('produces pattern ids the Historian review can cite', () => {
    const analysis = analyse_historian_result({ scans: history([scan(day(0)), scan(day(1))]), focus: ['nutriscore'], time_zone: 'UTC' })
    const review = {
      status: 'available' as const,
      summary: 'You scanned 2 products, both with Nutri-Score E.',
      findings: analysis.patterns.map((item) => ({ pattern_id: item.id, statement: 'A computed fact.' })),
      limitations: ['Window: last 30 days.'],
    }

    expect(() =>
      finalize_historian_review(
        {
          question: 'How healthy were my scans?',
          window: { label: 'last 30 days', ...window, time_zone: 'UTC', defaulted: true, capped: false, notes: [] },
          analysis,
        },
        review,
      ),
    ).not.toThrow()
  })

  it('rejects a history that breaks the scan history contract', () => {
    const out_of_order = history([scan(day(1)), scan(day(0))])

    expect(() => analyse_historian_result({ scans: out_of_order, focus: [], time_zone: 'UTC' })).toThrow()
  })

  it('runs as a tool and honours cancellation', async () => {
    const tool = tool_historian_analyse_result()
    const args = { scans: history([scan(day(0))]), focus: [], time_zone: 'UTC' }
    const controller = new AbortController()

    expect(await tool.execute!(args, { toolContext: { abortSignal: controller.signal } } as never)).toMatchObject({ status: 'available' })
    controller.abort()
    await expect(tool.execute!(args, { toolContext: { abortSignal: controller.signal } } as never)).rejects.toThrow()
  })
})
