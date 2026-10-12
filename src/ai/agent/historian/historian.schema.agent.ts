import { z } from 'zod'

export const enum_historian_period_type = ['calendar', 'rolling', 'since', 'range', 'all_time', 'none'] as const
export const enum_historian_period_unit = ['hour', 'day', 'week', 'month', 'year'] as const
export const enum_historian_focus = ['scan_count', 'products', 'brands', 'nutriscore', 'ecoscore', 'nova_group'] as const

export const schema_agent_historian_request = z.object({
  period: z.object({
    type: z
      .enum(enum_historian_period_type)
      .describe(
        'calendar = today/this week/last month…; rolling = last N units; since = from a date until now; range = between two dates (also "in March", "during Ramadan", "before May"); all_time; none = no period mentioned',
      ),
    unit: z.enum(enum_historian_period_unit).nullable().describe('calendar: day|week|month|year; rolling: any unit; otherwise null'),
    offset: z.number().int().min(-1).max(0).nullable().describe('calendar only: 0 = current, -1 = previous; otherwise null'),
    count: z.number().int().min(1).max(1000).nullable().describe('rolling only: number of units; otherwise null'),
    from: z.iso.date().nullable().describe('since/range: first local date included (YYYY-MM-DD); null for an open start'),
    to: z.iso.date().nullable().describe('range only: last local date included (YYYY-MM-DD)'),
  }),
  focus: z.array(z.enum(enum_historian_focus)).max(enum_historian_focus.length).describe('What the user wants analyzed; empty = general overview'),
})

export type type_schema_agent_historian_request = z.infer<typeof schema_agent_historian_request>

export const enum_historian_weekday = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

// Call 1 input: the question plus the local calendar context needed to resolve relative periods.
export const schema_input_agent_historian_request = z.object({
  question: z.string().trim().min(1).max(4000),
  today: z.iso.date(),
  weekday: z.enum(enum_historian_weekday),
  time_zone: z.string().min(1),
  week_start: z.enum(enum_historian_weekday),
})

// What the analysis code hands to call 2. Each pattern carries a stable id that findings must cite.
export const schema_historian_analysis = z.object({
  status: z.enum(['available', 'insufficient_history']),
  total_scans: z.number().int().nonnegative(),
  truncated: z.boolean(),
  patterns: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        kind: z.string().min(1).max(64),
        values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
      }),
    )
    .max(50),
  limitations: z.array(z.string().min(1)).max(20),
})

// Call 2 input: the question (for language only), the resolved window, and the computed analysis.
export const schema_input_agent_historian = z.object({
  question: z.string().trim().min(1).max(4000),
  window: z.object({
    label: z.string().min(1),
    from: z.iso.datetime(),
    to: z.iso.datetime(),
    time_zone: z.string().min(1),
    defaulted: z.boolean(),
    capped: z.boolean(),
    notes: z.array(z.string()),
  }),
  analysis: schema_historian_analysis,
})

// Call 2 output: a grounded description of the computed patterns.
export const schema_agent_historian = z.object({
  status: z.enum(['available', 'insufficient_history']),
  summary: z.string().min(1).max(600),
  findings: z
    .array(
      z.object({
        pattern_id: z.string().min(1).max(64).describe('The id of the computed pattern this statement describes'),
        statement: z.string().min(1).max(400),
      }),
    )
    .max(20),
  limitations: z.array(z.string().min(1).max(400)).max(10),
})

export type type_input_agent_historian_request = z.infer<typeof schema_input_agent_historian_request>
export type type_historian_analysis = z.infer<typeof schema_historian_analysis>
export type type_input_agent_historian = z.infer<typeof schema_input_agent_historian>
export type type_schema_agent_historian = z.infer<typeof schema_agent_historian>

// The Historian workflow step output: the window actually analyzed, the computed analysis, and the
// model's grounded description of it. review is null when the history was insufficient or when the
// description failed validation; the computed analysis stays usable either way.
export const schema_historian_result = z.object({
  status: z.enum(['available', 'insufficient_history', 'not_permitted']),
  time_window: z
    .object({
      label: z.string().min(1),
      from: z.iso.datetime(),
      to: z.iso.datetime(),
      time_zone: z.string().min(1),
    })
    .nullable(),
  focus: z.array(z.enum(enum_historian_focus)),
  analysis: schema_historian_analysis.nullable(),
  review: schema_agent_historian.nullable(),
  limitations: z.array(z.string().min(1)),
})

export type type_historian_result = z.infer<typeof schema_historian_result>
