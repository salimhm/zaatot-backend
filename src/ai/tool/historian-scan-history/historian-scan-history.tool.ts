import type { consumer_backend_context } from '@ai/execution/execution-contract.ai'
import type { ai_tool_activity } from '@ai/runtime.ai'
import type { scan_history_window_scan } from '@module/user/scan-history/scan-history.service'
import type {
  type_tool_historian_scan_history_result,
  type_tool_historian_scan_history_window,
} from '@tool/historian-scan-history/historian-scan-history.dto.tool'

import { createTool } from '@voltagent/core'

import { dto_tool_historian_scan_history, historian_scan_history_limit } from '@tool/historian-scan-history/historian-scan-history.dto.tool'
import { lib_tool_own_user_payload, lib_tool_signal } from '@tool/utils.tool'

import { enum_ecoscore, enum_nutriscore } from '@lib/enum.lib'

import { service_scan_history } from '@module/user/scan-history/scan-history.service'

export type historian_scan_history_runtime = {
  use_tool: <T>(call: () => Promise<T>, activity: ai_tool_activity) => Promise<T>
}

export type historian_scan_history_dependency = Pick<typeof service_scan_history, 'find_window'>

const tool_activity: ai_tool_activity = {
  name: 'tool_historian_scan_history',
  title: 'Reading your scan history',
}

const text_or_null = (value: string | null | undefined) => value?.trim() || null

const grade_or_null = <T extends string>(grades: readonly T[], value: string | null | undefined): T | null => {
  const grade = value?.trim().toLowerCase()
  return grades.includes(grade as T) ? (grade as T) : null
}

const nova_group_or_null = (value: number | null | undefined) => (Number.isInteger(value) && value! >= 1 && value! <= 4 ? value! : null)

// Catalog rows are free text, so grades and names are normalized instead of failing the whole history read.
const normalize_product = (scan: scan_history_window_scan) => {
  const { product } = scan
  // A product record that no longer matches the scanned barcode cannot describe this scan.
  if (!product || product.product_barcode !== scan.product_barcode) return null
  return {
    product_id: product.product_id,
    barcode: product.product_barcode,
    name: text_or_null(product.product_name),
    brand_name: text_or_null(product.brand_name),
    type: text_or_null(product.product_type),
    nutriscore: grade_or_null(enum_nutriscore, product.product_nutriscore),
    ecoscore: grade_or_null(enum_ecoscore, product.product_ecoscore),
    nova_group: nova_group_or_null(product.product_nova_group),
  }
}

export const normalize_historian_scan_history = (
  window: type_tool_historian_scan_history_window,
  found: { scans: scan_history_window_scan[]; total: number },
): type_tool_historian_scan_history_result =>
  dto_tool_historian_scan_history.result.parse({
    window,
    scans: found.scans.map((scan) => ({
      scan_history_id: scan.scan_history_id,
      scanned_at: scan.scanned_at,
      barcode: scan.product_barcode,
      product: normalize_product(scan),
    })),
    total: Math.max(found.total, found.scans.length),
    truncated: found.total > found.scans.length,
  })

/**
 * Creates the per-request scan history tool. Its identity is captured from verified server
 * context, never from model-controlled tool arguments, and it reads one bounded window only.
 */
export const tool_historian_scan_history = (
  backend_context: consumer_backend_context,
  runtime?: historian_scan_history_runtime,
  dependency: historian_scan_history_dependency = service_scan_history,
) => {
  const payload = lib_tool_own_user_payload(backend_context)

  return createTool({
    name: 'tool_historian_scan_history',
    description:
      'Read the current user’s product scans inside one resolved UTC window, oldest first, with the product facts stored at scan time. Never accepts a user ID or reads another user’s history.',
    parameters: dto_tool_historian_scan_history.read,
    outputSchema: dto_tool_historian_scan_history.result,
    execute: async (args, options) => {
      const window = dto_tool_historian_scan_history.read.parse(args)
      const signal = lib_tool_signal(options)
      signal?.throwIfAborted()

      const read = () => dependency.find_window({ ...window, limit: historian_scan_history_limit }, payload)
      const found = runtime ? await runtime.use_tool(read, tool_activity) : await read()

      signal?.throwIfAborted()
      return normalize_historian_scan_history(window, found)
    },
  })
}

// The alias makes the per-request construction explicit at call sites.
export const create_historian_scan_history_tool = tool_historian_scan_history
