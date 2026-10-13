import type { type_schema_agent_historian_request } from '@agent/historian/historian.schema.agent'
import type { FilePart, ImagePart, ModelMessage, TextPart, UserContent } from '@ai-sdk/provider-utils'

import { z } from 'zod'

import { schema_agent_historian_request } from '@agent/historian/historian.schema.agent'

const image_extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heif', 'heic'] as const
const audio_extensions = ['mp3', 'ogg', 'wav', 'mp4', 'aac', 'm4a', 'opus'] as const

function resolve_media_type(ext: string): string {
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'heif':
      return 'image/heif'
    case 'heic':
      return 'image/heic'
    case 'mp3':
      return 'audio/mpeg'
    case 'ogg':
      return 'audio/ogg'
    case 'wav':
      return 'audio/wav'
    case 'mp4':
      return 'audio/mp4'
    case 'aac':
      return 'audio/aac'
    case 'm4a':
      return 'audio/x-m4a'
    case 'opus':
      return 'audio/ogg'
    default:
      return 'application/octet-stream'
  }
}

export async function ai_create_message(text: string, file_ids?: string[]): Promise<ModelMessage[]> {
  let files_data: { content: Buffer; file_id: string }[] = []
  if (file_ids && file_ids.length > 0) {
    files_data = await ai_fetch_file_data(file_ids)
  }

  const parts: UserContent = [{ type: 'text', text } satisfies TextPart]

  for (const file of files_data) {
    const ext = file.file_id.split('.').pop()?.toLowerCase() ?? ''

    if ((image_extensions as readonly string[]).includes(ext)) {
      parts.push({
        type: 'image',
        image: file.content,
        mediaType: resolve_media_type(ext),
      } satisfies ImagePart)
    } else if ((audio_extensions as readonly string[]).includes(ext)) {
      parts.push({
        type: 'file',
        data: file.content,
        mediaType: resolve_media_type(ext),
      } satisfies FilePart)
    } else if (ext === 'txt') {
      parts.push({
        type: 'text',
        text: `File: ${file.file_id}\nContent:\n${file.content.toString('utf8')}`,
      } satisfies TextPart)
    } else {
      console.warn(`Unsupported file type: ${file.file_id}`)
    }
  }

  const message: ModelMessage = { role: 'user', content: parts }
  return [message]
}

export async function ai_fetch_file_data(file_ids: string[]): Promise<{ content: Buffer; file_id: string }[]> {
  const cloudflare_r2_link = process.env.CLOUDFLARE_R2_LINK || ''

  return Promise.all(
    file_ids.map(async (file_id) => {
      const response = await fetch(`${cloudflare_r2_link}/${file_id}`)
      return {
        content: Buffer.from(await response.arrayBuffer()),
        file_id: file_id,
      }
    }),
  )
}

export const enum_tool_find_query = {
  page: z.number().optional(),
  take: z.number().optional().describe('min 1 and max 12'),
  combination_type: z.enum(['AND', 'OR']).optional(),
}

export const historian_window_default_days = 30
// 366 so a full leap year is not cut short.
export const historian_window_max_days = 366

const day_ms = 86_400_000
const hour_ms = 3_600_000

const month_names = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

type local_date = { year: number; month: number; day: number }

export type historian_period = type_schema_agent_historian_request['period']

export type historian_window = {
  kind:
    | 'today'
    | 'yesterday'
    | 'this_week'
    | 'last_week'
    | 'this_month'
    | 'last_month'
    | 'this_year'
    | 'last_year'
    | 'rolling'
    | 'since'
    | 'range'
    | 'all_time'
    | 'default'
  label: string
  /** Inclusive UTC start (ISO 8601). */
  from: string
  /** Exclusive UTC end (ISO 8601), never later than `now`. */
  to: string
  time_zone: string
  defaulted: boolean
  capped: boolean
  notes: string[]
}

const resolve_time_zone = (time_zone: string | undefined) => {
  if (!time_zone) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: time_zone })
    return time_zone
  } catch {
    return null
  }
}

const zoned_parts = (date: Date, time_zone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: time_zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

const zone_offset_ms = (time: number, time_zone: string) => {
  const parts = zoned_parts(new Date(time), time_zone)
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(time / 1000) * 1000
}

// Local midnight in the user's time zone as a UTC instant. The second pass corrects DST transitions.
const start_of_local_day = (date: local_date, time_zone: string) => {
  const wall_time = Date.UTC(date.year, date.month - 1, date.day)
  const first_guess = wall_time - zone_offset_ms(wall_time, time_zone)
  return wall_time - zone_offset_ms(first_guess, time_zone)
}

const to_local_date = (time: number): local_date => {
  const date = new Date(time)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

const add_days = (date: local_date, days: number) => to_local_date(Date.UTC(date.year, date.month - 1, date.day + days))

const add_months = (date: local_date, months: number): local_date => {
  const first = new Date(Date.UTC(date.year, date.month - 1 + months, 1))
  const days_in_month = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return { year: first.getUTCFullYear(), month: first.getUTCMonth() + 1, day: Math.min(date.day, days_in_month) }
}

// Monday = 0 … Sunday = 6.
const weekday = (date: local_date) => (new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay() + 6) % 7

const parse_iso_date = (value: string): local_date | null => {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const date = to_local_date(Date.UTC(year, month - 1, day))
  return date.year === year && date.month === month && date.day === day ? date : null
}

const format_date = (date: local_date) => `${date.day} ${month_names[date.month - 1]} ${date.year}`

const weekday_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

// Matches `weekday`, which counts from Monday.
export const historian_week_start = 'Monday' as const

/**
 * The local calendar context Historian's request reader needs to resolve relative periods.
 * It uses the same time zone fallback as resolve_historian_window, so both agree on "today".
 */
export const historian_local_context = (options: { now?: Date; time_zone?: string } = {}) => {
  const time_zone = resolve_time_zone(options.time_zone) ?? 'UTC'
  const parts = zoned_parts(options.now ?? new Date(), time_zone)
  const today: local_date = { year: parts.year, month: parts.month, day: parts.day }
  return {
    today: `${String(today.year).padStart(4, '0')}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`,
    weekday: weekday_names[weekday(today)]!,
    time_zone,
    week_start: historian_week_start,
  }
}

/**
 * Turns the structured period Historian's model extracted from the user's question (in any language)
 * into a bounded UTC window for history queries. Calendar periods follow the user's time zone and weeks
 * start on Monday. An invalid or missing period falls back to the last 30 days with a note, and every
 * window is capped at 366 days.
 */
export const resolve_historian_window = (period: unknown, options: { now?: Date; time_zone?: string } = {}): historian_window => {
  const now = (options.now ?? new Date()).getTime()
  const notes: string[] = []
  const resolved_time_zone = resolve_time_zone(options.time_zone)
  if (resolved_time_zone === null) notes.push(`Unknown time zone "${options.time_zone}"; UTC was used instead.`)
  const time_zone = resolved_time_zone ?? 'UTC'

  const today = zoned_parts(new Date(now), time_zone)
  const today_date: local_date = { year: today.year, month: today.month, day: today.day }
  const start = (date: local_date) => start_of_local_day(date, time_zone)

  type candidate = { kind: historian_window['kind']; label: string; from: number; to: number }

  const rolling_window = (count: number, unit: NonNullable<historian_period['unit']>): candidate => {
    const label = `last ${count} ${unit}${count === 1 ? '' : 's'}`
    if (unit === 'hour') return { kind: 'rolling', label, from: now - count * hour_ms, to: now }
    const first =
      unit === 'day'
        ? add_days(today_date, -count + 1)
        : unit === 'week'
          ? add_days(today_date, -count * 7 + 1)
          : add_days(add_months(today_date, unit === 'month' ? -count : -count * 12), 1)
    return { kind: 'rolling', label, from: start(first), to: now }
  }

  const invalid = (note: string) => {
    notes.push(note)
    return null
  }

  const resolve = (value: historian_period): candidate | null => {
    switch (value.type) {
      case 'calendar': {
        if (value.unit === null || value.unit === 'hour' || value.offset === null) {
          return invalid('The requested calendar period needs a day, week, month or year and whether it is the current or previous one.')
        }
        const previous = value.offset === -1
        if (value.unit === 'day') {
          return previous
            ? { kind: 'yesterday', label: 'yesterday', from: start(add_days(today_date, -1)), to: start(today_date) }
            : { kind: 'today', label: 'today', from: start(today_date), to: now }
        }
        const current_start: local_date =
          value.unit === 'week'
            ? add_days(today_date, -weekday(today_date))
            : value.unit === 'month'
              ? { ...today_date, day: 1 }
              : { year: today_date.year, month: 1, day: 1 }
        if (!previous) return { kind: `this_${value.unit}`, label: `this ${value.unit}`, from: start(current_start), to: now }
        const previous_start =
          value.unit === 'week'
            ? add_days(current_start, -7)
            : value.unit === 'month'
              ? add_months(current_start, -1)
              : { ...current_start, year: current_start.year - 1 }
        return { kind: `last_${value.unit}`, label: `last ${value.unit}`, from: start(previous_start), to: start(current_start) }
      }

      case 'rolling':
        if (value.unit === null || value.count === null) return invalid('The requested rolling period needs a unit and a count.')
        return rolling_window(value.count, value.unit)

      case 'since': {
        const first = value.from === null ? null : parse_iso_date(value.from)
        if (!first) return invalid('The requested start date is missing or not a valid calendar date.')
        return { kind: 'since', label: `since ${format_date(first)}`, from: start(first), to: now }
      }

      case 'range': {
        const last = value.to === null ? null : parse_iso_date(value.to)
        if (!last) return invalid('The requested end date is missing or not a valid calendar date.')
        // An open start ("before May") is bounded by the window cap below.
        if (value.from === null)
          return { kind: 'range', label: `until ${format_date(last)}`, from: Number.NEGATIVE_INFINITY, to: start(add_days(last, 1)) }
        const first = parse_iso_date(value.from)
        if (!first) return invalid('The requested start date is not a valid calendar date.')
        const [from, to] = start(first) <= start(last) ? [first, last] : [last, first]
        return { kind: 'range', label: `${format_date(from)} to ${format_date(to)}`, from: start(from), to: start(add_days(to, 1)) }
      }

      case 'all_time':
        return { kind: 'all_time', label: 'all available history', from: Number.NEGATIVE_INFINITY, to: now }

      case 'none':
        return null
    }
  }

  // The period usually comes from model output, so it is validated here rather than trusted.
  const parsed = schema_agent_historian_request.shape.period.safeParse(period)
  let window = parsed.success ? resolve(parsed.data) : invalid('The requested period could not be understood.')
  if (window && Math.min(window.to, now) <= window.from) {
    notes.push(`The requested period (${window.label}) has not started yet.`)
    window = null
  }

  let defaulted = false
  if (!window) {
    defaulted = true
    window = { ...rolling_window(historian_window_default_days, 'day'), kind: 'default' }
  }

  const to = Math.min(window.to, now)
  let from = window.from
  let capped = false
  if (to - from > historian_window_max_days * day_ms) {
    from = to - historian_window_max_days * day_ms
    capped = true
    notes.push(`History is limited to the most recent ${historian_window_max_days} days of the requested period.`)
  }

  return {
    kind: window.kind,
    label: window.label,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    time_zone,
    defaulted,
    capped,
    notes,
  }
}
