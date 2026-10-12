import { z } from 'zod'

import { historian_window_max_days } from '@ai/utils.ai'

import { enum_ecoscore, enum_nutriscore } from '@lib/enum.lib'

// Upper bound on scans returned for one window. Larger windows keep the most recent scans and report truncation.
export const historian_scan_history_limit = 500

const day_ms = 86_400_000

export const schema_tool_historian_scan_history_window = z
  .object({
    from: z.iso.datetime().describe('Inclusive UTC start of the window, from resolve_historian_window'),
    to: z.iso.datetime().describe('Exclusive UTC end of the window, from resolve_historian_window'),
  })
  .strict()
  .superRefine((window, context) => {
    const from = Date.parse(window.from)
    const to = Date.parse(window.to)
    if (from >= to) {
      context.addIssue({ code: 'custom', path: ['to'], message: 'The window must end after it starts.' })
    }
    if (to - from > historian_window_max_days * day_ms) {
      context.addIssue({ code: 'custom', path: ['from'], message: `The window cannot exceed ${historian_window_max_days} days.` })
    }
  })

// Product facts as stored when the product was first scanned; they may be older than the provider's current data.
export const schema_tool_historian_scan_history_product = z
  .object({
    product_id: z.number().int().positive(),
    barcode: z.string().min(1),
    name: z.string().min(1).nullable(),
    brand_name: z.string().min(1).nullable(),
    type: z.string().min(1).nullable(),
    nutriscore: z.enum(enum_nutriscore).nullable(),
    ecoscore: z.enum(enum_ecoscore).nullable(),
    nova_group: z.number().int().min(1).max(4).nullable(),
  })
  .strict()

export const schema_tool_historian_scan_history_scan = z
  .object({
    scan_history_id: z.number().int().positive(),
    scanned_at: z.iso.datetime().describe('UTC time of the scan'),
    barcode: z.string().min(1),
    // Null when the scanned product record no longer exists.
    product: schema_tool_historian_scan_history_product.nullable(),
  })
  .strict()

export const schema_tool_historian_scan_history_result = z
  .object({
    window: schema_tool_historian_scan_history_window,
    // The most recent scans in the window, ordered oldest first.
    scans: z.array(schema_tool_historian_scan_history_scan).max(historian_scan_history_limit),
    // Every non-deleted scan in the window, including those beyond the limit.
    total: z.number().int().nonnegative(),
    truncated: z.boolean(),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.scans.length > result.total) {
      context.addIssue({ code: 'custom', path: ['total'], message: 'The total cannot be lower than the number of returned scans.' })
    }
    if (result.truncated !== result.total > result.scans.length) {
      context.addIssue({ code: 'custom', path: ['truncated'], message: 'Truncated must be true exactly when scans were left out.' })
    }

    const from = Date.parse(result.window.from)
    const to = Date.parse(result.window.to)
    let previous = Number.NEGATIVE_INFINITY
    result.scans.forEach((scan, index) => {
      const scanned_at = Date.parse(scan.scanned_at)
      if (scanned_at < from || scanned_at >= to) {
        context.addIssue({ code: 'custom', path: ['scans', index, 'scanned_at'], message: 'Every scan must fall inside the window.' })
      }
      if (scanned_at < previous) {
        context.addIssue({ code: 'custom', path: ['scans', index, 'scanned_at'], message: 'Scans must be ordered oldest first.' })
      }
      if (scan.product && scan.product.barcode !== scan.barcode) {
        context.addIssue({ code: 'custom', path: ['scans', index, 'product', 'barcode'], message: 'The product must match the scanned barcode.' })
      }
      previous = scanned_at
    })
  })

export const dto_tool_historian_scan_history = {
  read: schema_tool_historian_scan_history_window,
  result: schema_tool_historian_scan_history_result,
}

export type type_tool_historian_scan_history_window = z.infer<typeof schema_tool_historian_scan_history_window>
export type type_tool_historian_scan_history_scan = z.infer<typeof schema_tool_historian_scan_history_scan>
export type type_tool_historian_scan_history_result = z.infer<typeof schema_tool_historian_scan_history_result>
