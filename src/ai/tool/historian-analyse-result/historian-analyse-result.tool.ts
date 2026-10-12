import type { type_historian_analysis } from '@agent/historian/historian.schema.agent'
import type { type_tool_historian_analyse_result_input } from '@tool/historian-analyse-result/historian-analyse-result.dto.tool'
import type { type_tool_historian_scan_history_scan } from '@tool/historian-scan-history/historian-scan-history.dto.tool'

import { createTool } from '@voltagent/core'

import {
  dto_tool_historian_analyse_result,
  historian_analyse_comparison_min_scans,
  historian_analyse_comparison_z,
  historian_analyse_top_limit,
} from '@tool/historian-analyse-result/historian-analyse-result.dto.tool'
import { lib_tool_signal } from '@tool/utils.tool'

import { enum_ecoscore, enum_nutriscore } from '@lib/enum.lib'

type historian_pattern = type_historian_analysis['patterns'][number]
type historian_pattern_values = historian_pattern['values']
type historian_scan = type_tool_historian_scan_history_scan
type historian_grade_focus = 'nutriscore' | 'ecoscore' | 'nova_group'

const grade_limitation = 'Grades are the ones saved when each product was first scanned and may differ from current product data.'
const comparison_limitation = `Changes compare the earlier and later half of the graded scans in the window. A change counts as clear only with at least ${historian_analyse_comparison_min_scans} graded scans in each half and a statistically significant difference.`

const percent = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 1000) / 10)

// Every grade pattern follows the same shape: the grade read from a scan, the buckets it is counted in,
// and the share used for the earlier/later comparison.
const grade_metrics: Record<
  historian_grade_focus,
  {
    grade: (scan: historian_scan) => string | null
    buckets: readonly string[]
    bucket_key: (grade: string) => string
    share: { key: string; grades: readonly string[] }
    secondary_share?: { key: string; grades: readonly string[] }
  }
> = {
  nutriscore: {
    grade: (scan) => scan.product?.nutriscore ?? null,
    buckets: enum_nutriscore,
    bucket_key: (grade) => grade,
    share: { key: 'share_a_or_b_percent', grades: ['a', 'b'] },
    secondary_share: { key: 'share_d_or_e_percent', grades: ['d', 'e'] },
  },
  ecoscore: {
    grade: (scan) => scan.product?.ecoscore ?? null,
    buckets: enum_ecoscore,
    bucket_key: (grade) => grade,
    share: { key: 'share_a_or_b_percent', grades: ['a', 'b'] },
    secondary_share: { key: 'share_d_or_e_percent', grades: ['d', 'e'] },
  },
  nova_group: {
    grade: (scan) => (scan.product?.nova_group ? String(scan.product.nova_group) : null),
    buckets: ['1', '2', '3', '4'],
    bucket_key: (grade) => `nova_${grade}`,
    share: { key: 'share_nova_4_percent', grades: ['4'] },
  },
}

const local_day = (scanned_at: string, time_zone: string) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: time_zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(scanned_at))
  } catch {
    return scanned_at.slice(0, 10)
  }
}

const scan_count_pattern = (scans: historian_scan[], total: number, time_zone: string): historian_pattern => {
  const per_barcode = new Map<string, number>()
  for (const scan of scans) per_barcode.set(scan.barcode, (per_barcode.get(scan.barcode) ?? 0) + 1)
  return {
    id: 'scan_count',
    kind: 'scan_count',
    values: {
      total_scans: total,
      analyzed_scans: scans.length,
      distinct_products: per_barcode.size,
      repeated_products: [...per_barcode.values()].filter((count) => count > 1).length,
      active_days: new Set(scans.map((scan) => local_day(scan.scanned_at, time_zone))).size,
      missing_product_records: scans.filter((scan) => scan.product === null).length,
      first_scan_at: scans[0]?.scanned_at ?? null,
      last_scan_at: scans.at(-1)?.scanned_at ?? null,
    },
  }
}

type ranked = { key: string; count: number; last_index: number; values: historian_pattern_values }

// Most scanned first; ties go to the most recently scanned, so the order is stable for the same history.
const top = (items: Map<string, ranked>) =>
  [...items.values()]
    .sort((a, b) => b.count - a.count || b.last_index - a.last_index || a.key.localeCompare(b.key))
    .slice(0, historian_analyse_top_limit)

const ranking_values = (entries: ranked[], distinct_key: string, distinct: number): historian_pattern_values => {
  const values: historian_pattern_values = { [distinct_key]: distinct, listed: entries.length }
  entries.forEach((entry, index) => {
    for (const [key, value] of Object.entries(entry.values)) values[`rank_${index + 1}_${key}`] = value
    values[`rank_${index + 1}_scans`] = entry.count
  })
  return values
}

const top_products_pattern = (scans: historian_scan[]): historian_pattern => {
  const products = new Map<string, ranked>()
  scans.forEach((scan, index) => {
    const entry = products.get(scan.barcode)
    products.set(scan.barcode, {
      key: scan.barcode,
      count: (entry?.count ?? 0) + 1,
      last_index: index,
      // The latest record wins, so a product renamed during the window shows its newest name.
      values: {
        name: scan.product?.name ?? (entry?.values.name as string | null | undefined) ?? null,
        brand: scan.product?.brand_name ?? (entry?.values.brand as string | null | undefined) ?? null,
        barcode: scan.barcode,
      },
    })
  })
  return { id: 'top_products', kind: 'ranking', values: ranking_values(top(products), 'distinct_products', products.size) }
}

const top_brands_pattern = (scans: historian_scan[]): historian_pattern => {
  const brands = new Map<string, ranked>()
  let without_brand = 0
  scans.forEach((scan, index) => {
    const brand = scan.product?.brand_name
    if (!brand) {
      without_brand++
      return
    }
    // Catalog spellings differ only in case often enough that they are counted as one brand.
    const key = brand.toLocaleLowerCase('en-US')
    const entry = brands.get(key)
    brands.set(key, { key, count: (entry?.count ?? 0) + 1, last_index: index, values: { brand } })
  })
  return {
    id: 'top_brands',
    kind: 'ranking',
    values: { ...ranking_values(top(brands), 'distinct_brands', brands.size), scans_without_brand: without_brand },
  }
}

const distribution_pattern = (focus: historian_grade_focus, scans: historian_scan[]): historian_pattern => {
  const metric = grade_metrics[focus]
  const counts = Object.fromEntries(metric.buckets.map((grade) => [metric.bucket_key(grade), 0])) as Record<string, number>
  let graded = 0
  for (const scan of scans) {
    const grade = metric.grade(scan)
    if (grade === null) continue
    counts[metric.bucket_key(grade)]!++
    graded++
  }
  const share_of = (grades: readonly string[]) =>
    percent(
      grades.reduce((sum, grade) => sum + counts[metric.bucket_key(grade)]!, 0),
      graded,
    )
  return {
    id: `${focus}_distribution`,
    kind: 'grade_distribution',
    values: {
      ...counts,
      unknown: scans.length - graded,
      graded_scans: graded,
      [metric.share.key]: share_of(metric.share.grades),
      ...(metric.secondary_share ? { [metric.secondary_share.key]: share_of(metric.secondary_share.grades) } : {}),
    },
  }
}

// Two-proportion z-test. A difference counts only when both halves are large enough and it is significant.
const clear_change = (earlier: { hits: number; n: number }, later: { hits: number; n: number }) => {
  if (earlier.n < historian_analyse_comparison_min_scans || later.n < historian_analyse_comparison_min_scans) return false
  const pooled = (earlier.hits + later.hits) / (earlier.n + later.n)
  const standard_error = Math.sqrt(pooled * (1 - pooled) * (1 / earlier.n + 1 / later.n))
  if (standard_error === 0) return false
  return Math.abs(later.hits / later.n - earlier.hits / earlier.n) / standard_error >= historian_analyse_comparison_z
}

/** Compares the earlier and later half of the graded scans. Null when there are not two scans to compare. */
const comparison_pattern = (focus: historian_grade_focus, scans: historian_scan[]): historian_pattern | null => {
  const metric = grade_metrics[focus]
  const graded = scans.flatMap((scan) => {
    const grade = metric.grade(scan)
    return grade === null ? [] : [{ scanned_at: scan.scanned_at, hit: metric.share.grades.includes(grade) }]
  })
  if (graded.length < 2) return null

  const middle = Math.floor(graded.length / 2)
  const halves = [graded.slice(0, middle), graded.slice(middle)].map((half) => ({
    hits: half.filter((scan) => scan.hit).length,
    n: half.length,
  })) as [{ hits: number; n: number }, { hits: number; n: number }]
  const [earlier, later] = halves
  const earlier_percent = percent(earlier.hits, earlier.n)!
  const later_percent = percent(later.hits, later.n)!
  const enough_scans = earlier.n >= historian_analyse_comparison_min_scans && later.n >= historian_analyse_comparison_min_scans
  const clear = clear_change(earlier, later)

  return {
    id: `${focus}_comparison`,
    kind: 'earlier_later_comparison',
    values: {
      metric: metric.share.key,
      split_at: graded[middle]!.scanned_at,
      earlier_graded_scans: earlier.n,
      later_graded_scans: later.n,
      earlier_percent,
      later_percent,
      change_points: Math.round((later_percent - earlier_percent) * 10) / 10,
      enough_scans,
      clear_change: clear,
      direction: !clear ? 'no_clear_change' : later_percent > earlier_percent ? 'increased' : 'decreased',
    },
  }
}

const included = (focus: type_tool_historian_analyse_result_input['focus'], area: (typeof focus)[number]) =>
  focus.length === 0 || focus.includes(area)

/**
 * Computes every statistic Historian's model may describe from one validated scan history read.
 * Pure and deterministic: the same scans, focus, and time zone always give the same analysis.
 */
export const analyse_historian_result = (input: type_tool_historian_analyse_result_input): type_historian_analysis => {
  const { scans: history, focus, time_zone } = dto_tool_historian_analyse_result.analyse.parse(input)
  const scans = history.scans

  if (scans.length === 0) {
    return dto_tool_historian_analyse_result.result.parse({
      status: 'insufficient_history',
      total_scans: history.total,
      truncated: history.truncated,
      patterns: [],
      limitations: [],
    } satisfies type_historian_analysis)
  }

  // The scan count is always included: every other pattern needs it as context.
  const patterns: historian_pattern[] = [scan_count_pattern(scans, history.total, time_zone)]
  if (included(focus, 'products')) patterns.push(top_products_pattern(scans))
  if (included(focus, 'brands')) patterns.push(top_brands_pattern(scans))

  const grade_focus = (['nutriscore', 'ecoscore', 'nova_group'] as const).filter((area) => included(focus, area))
  let compared = false
  for (const area of grade_focus) {
    patterns.push(distribution_pattern(area, scans))
    const comparison = comparison_pattern(area, scans)
    if (comparison) {
      patterns.push(comparison)
      compared = true
    }
  }

  const missing_records = scans.filter((scan) => scan.product === null).length
  const limitations = [
    ...(grade_focus.length > 0 ? [grade_limitation] : []),
    ...(compared ? [comparison_limitation] : []),
    ...(missing_records > 0
      ? [
          `${missing_records} scan${missing_records === 1 ? '' : 's'} refer to a product with no stored record, so they have no name, brand, or grades.`,
        ]
      : []),
  ]

  return dto_tool_historian_analyse_result.result.parse({
    status: 'available',
    total_scans: history.total,
    truncated: history.truncated,
    patterns,
    limitations,
  } satisfies type_historian_analysis)
}

/**
 * The analysis as a tool. It reads no database and needs no identity: it only computes from the
 * history that tool_historian_scan_history already returned for the verified user.
 */
export const tool_historian_analyse_result = () =>
  createTool({
    name: 'tool_historian_analyse_result',
    description:
      'Compute scan counts, top products and brands, grade distributions, and earlier/later comparisons from one scan history result. Returns only computed patterns with stable ids.',
    parameters: dto_tool_historian_analyse_result.analyse,
    outputSchema: dto_tool_historian_analyse_result.result,
    execute: async (args, options) => {
      const signal = lib_tool_signal(options)
      signal?.throwIfAborted()
      return analyse_historian_result(args)
    },
  })
