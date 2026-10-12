import type {
  type_historian_analysis,
  type_historian_result,
  type_schema_agent_historian,
  type_schema_agent_historian_request,
} from '@agent/historian/historian.schema.agent'
import type { consumer_backend_context, consumer_specialist_input, consumer_step_result } from '@ai/execution/execution-contract.ai'
import type { historian_window } from '@ai/utils.ai'
import type { type_tool_historian_scan_history_result } from '@tool/historian-scan-history/historian-scan-history.dto.tool'

import { unique_strings } from '@ai/adapter/utils.adapter.ai'
import { historian_local_context, resolve_historian_window } from '@ai/utils.ai'
import { agent_historian, agent_historian_request } from '@agent/historian/historian.agent'
import { schema_historian_analysis, schema_historian_result } from '@agent/historian/historian.schema.agent'
import { dto_tool_historian_scan_history } from '@tool/historian-scan-history/historian-scan-history.dto.tool'
import { create_historian_scan_history_tool } from '@tool/historian-scan-history/historian-scan-history.tool'

/** Computes patterns from the scans in code. Its output is the only data Historian's model describes. */
export type historian_analyse = (input: {
  scans: type_tool_historian_scan_history_result
  focus: type_schema_agent_historian_request['focus']
  window: historian_window
}) => type_historian_analysis | Promise<type_historian_analysis>

export type historian_adapter_dependency = {
  analyse: historian_analyse
  read_request?: typeof agent_historian_request
  review?: typeof agent_historian
  now?: () => Date
}

const scan_limitation = 'Scans show which products were looked up in Zaatot, not what was bought or consumed.'
const time_zone_limitation = 'Periods were calculated in UTC because the user’s time zone is not available.'

const without_history = (status: 'blocked' | 'needs_input', limitation: string): consumer_step_result => {
  const output: type_historian_result = {
    status: 'not_permitted',
    time_window: null,
    focus: [],
    analysis: null,
    review: null,
    limitations: [limitation],
  }
  return { status, output: schema_historian_result.parse(output), limitations: output.limitations }
}

/**
 * Historian adapter. Code decides everything that can be decided in code: permission, the window,
 * the history read, and the statistics. The model only reads the question and describes the result.
 */
export const adapter_historian =
  (dependency: historian_adapter_dependency) =>
  async (input: consumer_specialist_input, signal: AbortSignal, backend_context?: consumer_backend_context): Promise<consumer_step_result> => {
    signal.throwIfAborted()
    if (!backend_context) return without_history('blocked', 'Verified authentication context is required to read scan history.')
    if (input.dependencies['Vault Keeper']?.permissions?.history !== true) {
      return without_history('needs_input', 'Permission to use scan history is unavailable for this request.')
    }

    const now = dependency.now?.() ?? new Date()
    // An unknown name is handled by resolve_historian_window, which falls back to UTC and adds a note.
    const time_zone = input.time_zone
    const limitations: string[] = time_zone ? [] : [time_zone_limitation]

    // 1. The model reads the question in any language; resolve_historian_window validates its period.
    const request = await (dependency.read_request ?? agent_historian_request)(
      { question: input.prompt, ...historian_local_context({ now, time_zone }) },
      signal,
    )
    signal.throwIfAborted()
    if (!request.success) limitations.push('The requested period could not be read, so the default window was used.')
    const focus = request.success ? request.data.focus : []
    const window = resolve_historian_window(request.success ? request.data.period : null, { now, time_zone })
    limitations.push(...window.notes)

    // 2. Read the permitted history for the verified user only.
    const tool = create_historian_scan_history_tool(backend_context, { use_tool: input.use_tool })
    const scans = dto_tool_historian_scan_history.result.parse(
      await tool.execute!({ from: window.from, to: window.to }, { toolContext: { abortSignal: signal } } as never),
    )
    signal.throwIfAborted()
    if (scans.truncated) limitations.push(`Only the ${scans.scans.length} most recent of ${scans.total} scans in this window were analyzed.`)

    // 3. Compute the patterns in code.
    const analysis = schema_historian_analysis.parse(await dependency.analyse({ scans, focus, window }))
    signal.throwIfAborted()
    limitations.push(...analysis.limitations)

    // 4. Describe them. An insufficient history needs no model call, and a description that fails
    //    validation is dropped rather than published; the computed analysis remains.
    let review: type_schema_agent_historian | null = null
    if (analysis.status === 'available') {
      const reviewed = await (dependency.review ?? agent_historian)(
        {
          question: input.prompt,
          window: {
            label: window.label,
            from: window.from,
            to: window.to,
            time_zone: window.time_zone,
            defaulted: window.defaulted,
            capped: window.capped,
            notes: window.notes,
          },
          analysis,
        },
        signal,
      )
      signal.throwIfAborted()
      if (reviewed.success) review = reviewed.data
      else limitations.push('The computed patterns could not be described reliably, so no description is included.')
    }
    limitations.push(scan_limitation)

    const output = schema_historian_result.parse({
      status: analysis.status,
      time_window: { label: window.label, from: window.from, to: window.to, time_zone: window.time_zone },
      focus,
      analysis,
      review,
      limitations: unique_strings(limitations),
    } satisfies type_historian_result)

    return {
      status: analysis.status === 'available' && review ? 'completed' : 'partial',
      output,
      limitations: output.limitations,
    }
  }
