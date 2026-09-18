import { z } from 'zod'

import { consumer_agent_names } from '@ai/src/workflow.definition'

export const schema_agent_conductor_plan = z.object({
  intent: z.string().min(1).max(1000).describe('The user intent extracted from user private database'),
  steps: z
    .array(
      z.object({
        agent: z.enum(consumer_agent_names),
        purpose: z.string().min(1).max(1000).describe('The proposed responsibility of this agent for this request'),
      }),
    )
    .max(16)
    .describe('Proposed future workflow steps only, not yet executed. Each step is a proposed agent and its purpose for this request'),
})

export const schema_agent_conductor_input = z.object({
  prompt: z.string().trim().min(1).max(4000),
  user_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
})

const schema_product = z.object({
  barcode: z.string().nullable(),
  name: z.string().min(1),
  brand: z.string().nullable(),
})

export const schema_agent_conductor = z.object({
  execution_id: z.string().uuid(),
  status: z.enum(['completed', 'partial', 'blocked', 'needs_input', 'needs_review', 'error']),
  product: schema_product.nullable().describe('Product identity resolved by Detective, or null when unresolved'),
  assessments: z
    .array(
      z.object({
        agent: z.enum(consumer_agent_names), // []
        status: z.enum(['completed', 'partial', 'blocked', 'needs_input', 'needs_review', 'error', 'skipped']),
        summary: z.string().describe('Reviewed findings contributed by this agent'),
        source_ids: z.array(z.string()),
        limitations: z.array(z.string()),
      }),
    )
    .describe('Reviewed contributions from the agents selected for this execution'),
  alternatives: z.array(
    z.object({
      product: schema_product,
      reasons: z.array(z.string()).describe('Evidence-backed reasons for recommending this validated alternative'),
      source_ids: z.array(z.string()),
    }),
  ),
  explanation: z
    .object({
      summary: z.string(),
      reasons: z.array(z.string()),
      tradeoffs: z.array(z.string()),
      citation_ids: z.array(z.string()),
    })
    .nullable()
    .describe('Storyteller explanation approved by Gatekeeper, or null before final review'),
  sources: z.array(
    z.object({
      id: z.string(),
      provider: z.string(),
      url: z.url().nullable(),
      retrieved_at: z.iso.datetime(),
    }),
  ),
  limitations: z.array(z.string()),
})

export const schema_agent_conductor_result = schema_agent_conductor

export type type_schema_agent_conductor = z.infer<typeof schema_agent_conductor>
export type type_schema_agent_conductor_plan = z.infer<typeof schema_agent_conductor_plan>
export type type_schema_agent_conductor_input = z.infer<typeof schema_agent_conductor_input>
export type type_schema_agent_conductor_result = z.infer<typeof schema_agent_conductor_result>
