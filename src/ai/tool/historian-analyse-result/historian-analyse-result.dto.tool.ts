import { z } from 'zod'

import { enum_historian_focus, schema_historian_analysis } from '@agent/historian/historian.schema.agent'
import { schema_tool_historian_scan_history_result } from '@tool/historian-scan-history/historian-scan-history.dto.tool'

// How many products and brands the ranking patterns list.
export const historian_analyse_top_limit = 5

// Each half of a comparison needs this many graded scans before a change can count as clear.
export const historian_analyse_comparison_min_scans = 5

// Two-sided 95% threshold for the two-proportion z-test behind every comparison.
export const historian_analyse_comparison_z = 1.96

export const schema_tool_historian_analyse_result_input = z
  .object({
    scans: schema_tool_historian_scan_history_result.describe('The output of tool_historian_scan_history for the resolved window'),
    focus: z.array(z.enum(enum_historian_focus)).max(enum_historian_focus.length).describe('What the user asked about; empty = general overview'),
    time_zone: z.string().min(1).describe('IANA time zone used to count local scan days, from resolve_historian_window'),
  })
  .strict()

export const dto_tool_historian_analyse_result = {
  analyse: schema_tool_historian_analyse_result_input,
  result: schema_historian_analysis,
}

export type type_tool_historian_analyse_result_input = z.infer<typeof schema_tool_historian_analyse_result_input>
