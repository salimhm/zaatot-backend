import type { scan_history_window_scan } from '@module/user/scan-history/scan-history.service'
import type { type_tool_historian_scan_history_result } from '@tool/historian-scan-history/historian-scan-history.dto.tool'
import type { historian_scan_history_runtime } from '@tool/historian-scan-history/historian-scan-history.tool'

import { describe, expect, it, mock } from 'bun:test'

import { dto_tool_historian_scan_history, historian_scan_history_limit } from '@tool/historian-scan-history/historian-scan-history.dto.tool'
import { create_historian_scan_history_tool } from '@tool/historian-scan-history/historian-scan-history.tool'

import { from_sqlite_datetime, to_sqlite_datetime } from '@module/user/scan-history/scan-history.service'

const window = { from: '2026-09-08T00:00:00.000Z', to: '2026-10-08T10:00:00.000Z' }

const scan = (scan_history_id: number, scanned_at: string, barcode = '5449000054227') => ({
  scan_history_id,
  scanned_at,
  barcode,
  product: {
    product_id: 1,
    barcode,
    name: 'Example Cola 330 ml',
    brand_name: 'Example Cola',
    type: 'food',
    nutriscore: 'e' as const,
    ecoscore: null,
    nova_group: 4,
  },
})

const result = (overrides: Record<string, unknown> = {}) => ({
  window,
  scans: [scan(1, '2026-09-10T08:00:00.000Z'), scan(2, '2026-10-01T18:30:00.000Z')],
  total: 2,
  truncated: false,
  ...overrides,
})

describe('Historian scan history DTO', () => {
  it('accepts a resolved window', () => {
    expect(dto_tool_historian_scan_history.read.safeParse(window).success).toBe(true)
  })

  it.each([
    ['an end before the start', { from: window.to, to: window.from }],
    ['a window longer than the cap', { from: '2024-01-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' }],
    ['a user identifier from the model', { ...window, user_id: 2 }],
    ['a non-ISO date', { from: '2026-09-08 00:00:00', to: window.to }],
  ])('rejects a window with %s', (_, value) => {
    expect(dto_tool_historian_scan_history.read.safeParse(value).success).toBe(false)
  })

  it('accepts ordered scans inside the window, including a missing product record', () => {
    const missing_product = { ...scan(3, '2026-10-02T09:00:00.000Z', '3017620422003'), product: null }
    expect(dto_tool_historian_scan_history.result.safeParse(result({ scans: [...result().scans, missing_product], total: 3 })).success).toBe(true)
  })

  it('accepts an empty window', () => {
    expect(dto_tool_historian_scan_history.result.safeParse(result({ scans: [], total: 0 })).success).toBe(true)
  })

  it('requires truncated to match the total', () => {
    expect(dto_tool_historian_scan_history.result.safeParse(result({ total: 10 })).success).toBe(false)
    expect(dto_tool_historian_scan_history.result.safeParse(result({ total: 10, truncated: true })).success).toBe(true)
    expect(dto_tool_historian_scan_history.result.safeParse(result({ total: 1 })).success).toBe(false)
  })

  it.each([
    ['a scan outside the window', { scans: [scan(1, '2026-09-01T00:00:00.000Z')], total: 1 }],
    ['a scan at the exclusive end', { scans: [scan(1, window.to)], total: 1 }],
    ['scans out of order', { scans: [scan(2, '2026-10-01T18:30:00.000Z'), scan(1, '2026-09-10T08:00:00.000Z')] }],
    ['a product that does not match the barcode', { scans: [{ ...scan(1, '2026-09-10T08:00:00.000Z'), barcode: '3017620422003' }], total: 1 }],
    [
      'more scans than the limit',
      {
        scans: Array.from({ length: historian_scan_history_limit + 1 }, (_, i) => scan(i + 1, '2026-09-10T08:00:00.000Z')),
        total: historian_scan_history_limit + 1,
      },
    ],
  ])('rejects %s', (_, overrides) => {
    expect(dto_tool_historian_scan_history.result.safeParse(result(overrides)).success).toBe(false)
  })
})

const backend_context = {
  payload: {
    user_id: 7,
    tenants: [
      { tenant_id: 3, tenant_type: 'organization' as const, tenant_schema_version: 'org-v1' },
      { tenant_id: 7, tenant_type: 'user' as const, tenant_schema_version: 'user-schema-v1' },
    ],
  },
}

const stored_scan = (scan_history_id: number, scanned_at: string, overrides: Partial<NonNullable<scan_history_window_scan['product']>> = {}) => ({
  scan_history_id,
  product_id: 1,
  product_barcode: '5449000054227',
  scanned_at,
  product: {
    product_id: 1,
    product_barcode: '5449000054227',
    product_type: 'food',
    product_name: 'Example Cola 330 ml',
    product_nova_group: 4,
    product_ecoscore: null,
    product_nutriscore: 'E',
    brand_name: 'Example Cola',
    ...overrides,
  },
})

describe('Historian scan history tool', () => {
  it('reads one bounded window for the verified user only', async () => {
    const find_window = mock(async () => ({ scans: [stored_scan(1, '2026-09-10T08:00:00.000Z')], total: 1 }))
    const activities: unknown[] = []
    const use_tool: historian_scan_history_runtime['use_tool'] = async (call, activity) => {
      activities.push(activity)
      return await call()
    }
    const tool = create_historian_scan_history_tool(backend_context, { use_tool }, { find_window })

    await expect(tool.execute!(window)).resolves.toEqual({
      window,
      scans: [
        {
          scan_history_id: 1,
          scanned_at: '2026-09-10T08:00:00.000Z',
          barcode: '5449000054227',
          product: {
            product_id: 1,
            barcode: '5449000054227',
            name: 'Example Cola 330 ml',
            brand_name: 'Example Cola',
            type: 'food',
            nutriscore: 'e',
            ecoscore: null,
            nova_group: 4,
          },
        },
      ],
      total: 1,
      truncated: false,
    })
    expect(find_window).toHaveBeenCalledWith(
      { ...window, limit: historian_scan_history_limit },
      { user_id: 7, tenants: [{ tenant_id: 7, tenant_type: 'user', tenant_schema_version: 'user-schema-v1' }] },
    )
    expect(activities).toEqual([{ name: 'tool_historian_scan_history', title: 'Reading your scan history' }])
  })

  it('reports truncation when the window has more scans than were returned', async () => {
    const tool = create_historian_scan_history_tool(backend_context, undefined, {
      find_window: async () => ({ scans: [stored_scan(1, '2026-09-10T08:00:00.000Z')], total: 900 }),
    })

    await expect(tool.execute!(window)).resolves.toMatchObject({ total: 900, truncated: true })
  })

  it('normalizes unusable catalog values instead of failing the history read', async () => {
    const tool = create_historian_scan_history_tool(backend_context, undefined, {
      find_window: async () => ({
        scans: [
          stored_scan(1, '2026-09-10T08:00:00.000Z', {
            product_name: '  ',
            brand_name: null,
            product_nutriscore: 'unknown',
            product_ecoscore: 'B',
            product_nova_group: 7,
          }),
          stored_scan(2, '2026-09-11T08:00:00.000Z', { product_barcode: '3017620422003' }),
          { ...stored_scan(3, '2026-09-12T08:00:00.000Z'), product: null },
        ],
        total: 3,
      }),
    })

    const result = (await tool.execute!(window)) as type_tool_historian_scan_history_result
    expect(result.scans[0]!.product).toMatchObject({ name: null, brand_name: null, nutriscore: null, ecoscore: 'b', nova_group: null })
    expect(result.scans[1]!.product).toBeNull()
    expect(result.scans[2]!.product).toBeNull()
  })

  it('rejects a user identifier or an invalid window from the model', async () => {
    const find_window = mock(async () => ({ scans: [], total: 0 }))
    const tool = create_historian_scan_history_tool(backend_context, undefined, { find_window })

    await expect(tool.execute!({ ...window, user_id: 99 } as never)).rejects.toBeInstanceOf(Error)
    await expect(tool.execute!({ from: window.to, to: window.from })).rejects.toBeInstanceOf(Error)
    expect(find_window).not.toHaveBeenCalled()
  })

  it('refuses to run without the verified user database', () => {
    expect(() =>
      create_historian_scan_history_tool({ payload: { user_id: 7, tenants: [] } }, undefined, { find_window: async () => ({ scans: [], total: 0 }) }),
    ).toThrow()
  })

  it('does not read history after the request was cancelled', async () => {
    const find_window = mock(async () => ({ scans: [], total: 0 }))
    const tool = create_historian_scan_history_tool(backend_context, undefined, { find_window })
    const controller = new AbortController()
    controller.abort()

    await expect(tool.execute!(window, { toolContext: { abortSignal: controller.signal } } as never)).rejects.toThrow()
    expect(find_window).not.toHaveBeenCalled()
  })
})

describe('scan history SQLite datetime conversion', () => {
  it('converts window bounds to the stored CURRENT_TIMESTAMP format', () => {
    expect(to_sqlite_datetime('2026-09-08T00:00:00.000Z')).toBe('2026-09-08 00:00:00')
    // Second-precision rows must not fall before a bound with milliseconds.
    expect(to_sqlite_datetime('2026-10-08T10:00:00.250Z')).toBe('2026-10-08 10:00:01')
  })

  it('converts stored timestamps back to UTC ISO', () => {
    expect(from_sqlite_datetime('2026-10-01 18:30:00')).toBe('2026-10-01T18:30:00.000Z')
    expect(from_sqlite_datetime('2026-06-20T19:00:00Z')).toBe('2026-06-20T19:00:00.000Z')
  })
})
