import type { ai_tool_activity } from '@ai/runtime.ai'

import { createTool, createToolkit } from '@voltagent/core'

import { dto_tool_alternative_lookup, schema_tool_alternative_lookup_boycat_result } from '@tool/alternative-lookup/alternative-lookup.dto.tool'

import { service_boycott_provider } from '@module/main/boycott-provider/boycott-provider.service'

const normalize_name = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')

const tool_signal = (options?: { toolContext?: { abortSignal?: AbortSignal }; abortController?: AbortController }) =>
  options?.toolContext?.abortSignal ?? options?.abortController?.signal

export const tool_alternative_lookup_boycat_by_brand = createTool({
  name: 'tool_alternative_lookup_boycat_by_brand',
  description:
    'Retrieve alternative brand suggestions from Boycat for one exact resolved brand. Suggestions are unreviewed candidates, not recommendations.',
  parameters: dto_tool_alternative_lookup.boycat_by_brand,
  execute: async ({ brand_name }, options) => {
    const signal = tool_signal(options)
    signal?.throwIfAborted()
    const result = await service_boycott_provider.decide({ provider: 'boycat', brand_name }, signal)
    signal?.throwIfAborted()
    const seen = new Set<string>()
    const alternatives = result.data.alternatives.flatMap((alternative) => {
      const name = alternative.name.trim()
      const key = normalize_name(name)
      if (!name || !key || seen.has(key)) return []
      seen.add(key)
      return [
        {
          name,
          image_url: alternative.image_url?.trim() || null,
          description: alternative.description?.trim() || null,
        },
      ]
    })

    return schema_tool_alternative_lookup_boycat_result.parse({
      provider: 'boycat',
      provider_status: result.data.provider_status,
      requested_brand: brand_name.trim(),
      matched_brand: result.data.provider_matched_name?.trim() || result.data.matched_entity?.name.trim() || null,
      reason: result.data.reason,
      alternatives,
      retrieved_at: new Date().toISOString(),
    })
  },
})

export const toolkit_alternative_lookup = createToolkit({
  name: 'toolkit_alternative_lookup',
  description: 'Read-only external alternative-candidate sources',
  tools: [tool_alternative_lookup_boycat_by_brand],
})

export type alternative_lookup_runtime = {
  use_tool: <T>(call: () => Promise<T>, activity?: ai_tool_activity) => Promise<T>
  inspect_content: (text: string) => Promise<string>
}

export const create_alternative_lookup_toolkit = (runtime: alternative_lookup_runtime) =>
  createToolkit({
    ...toolkit_alternative_lookup,
    tools: [
      createTool({
        name: tool_alternative_lookup_boycat_by_brand.name,
        description: tool_alternative_lookup_boycat_by_brand.description,
        parameters: tool_alternative_lookup_boycat_by_brand.parameters,
        execute: async (args, options) =>
          runtime.use_tool(
            async () => {
              const output = await tool_alternative_lookup_boycat_by_brand.execute!(args, options)
              const inspected = await runtime.inspect_content(JSON.stringify(output))
              if (!inspected) throw new Error('Bait Tester rejected the Boycat alternative payload')
              return schema_tool_alternative_lookup_boycat_result.parse(JSON.parse(inspected))
            },
            {
              name: tool_alternative_lookup_boycat_by_brand.name,
              title: 'Searching Boycat for alternative brands',
              detail: `Looking for alternatives to ${args.brand_name}.`,
            },
          ),
      }),
    ],
  })
