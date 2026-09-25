import { t } from 'elysia'

import { consumer_agent_names } from '@ai/src/workflow.definition'

const product = t.Object({
  barcode: t.Union([t.String(), t.Null()]),
  name: t.String({ minLength: 1 }),
  brand: t.Union([t.String(), t.Null()]),
})

const subject = t.Object({
  type: t.UnionEnum(['product', 'brand']),
  name: t.String({ minLength: 1 }),
  barcode: t.Union([t.String(), t.Null()]),
  brand: t.Union([t.String(), t.Null()]),
})

const workflow_step = t.Object({
  sequence: t.Integer({ minimum: 1 }),
  step_id: t.String({ minLength: 1 }),
  execution_id: t.String({ format: 'uuid' }),
  timestamp: t.String({ format: 'date-time' }),
  type: t.UnionEnum([
    'workflow.started',
    'workflow.completed',
    'workflow.failed',
    'agent.started',
    'agent.completed',
    'agent.failed',
    'agent.skipped',
    'tool.started',
    'tool.completed',
    'tool.failed',
  ]),
  agent: t.Union([t.UnionEnum(consumer_agent_names), t.Null()]),
  status: t.UnionEnum(['running', 'completed', 'partial', 'blocked', 'needs_input', 'needs_review', 'error', 'skipped']),
  title: t.String({ minLength: 1, maxLength: 200 }),
  detail: t.Union([t.String({ minLength: 1, maxLength: 1000 }), t.Null()]),
  metadata: t.Object({
    tool: t.Union([t.String({ minLength: 1, maxLength: 200 }), t.Null()]),
    duration_ms: t.Union([t.Integer({ minimum: 0 }), t.Null()]),
  }),
})

export const dto_schema_ai_result = t.Object({
  execution_id: t.String({ format: 'uuid' }),
  status: t.UnionEnum(['completed', 'partial', 'blocked', 'needs_input', 'needs_review', 'error']),
  subject: t.Union([subject, t.Null()]),
  outcome: t.Union([t.UnionEnum(['evidence_found', 'no_matching_evidence', 'needs_input', 'needs_review', 'unavailable']), t.Null()]),
  product: t.Union([product, t.Null()]),
  assessments: t.Array(
    t.Object({
      agent: t.UnionEnum(consumer_agent_names),
      status: t.UnionEnum(['completed', 'partial', 'blocked', 'needs_input', 'needs_review', 'error', 'skipped']),
      summary: t.String(),
      source_ids: t.Array(t.String()),
      limitations: t.Array(t.String()),
    }),
  ),
  alternatives: t.Array(t.Object({ product, reasons: t.Array(t.String()), source_ids: t.Array(t.String()) })),
  explanation: t.Union([
    t.Null(),
    t.Object({ summary: t.String(), reasons: t.Array(t.String()), tradeoffs: t.Array(t.String()), citation_ids: t.Array(t.String()) }),
  ]),
  sources: t.Array(
    t.Object({
      id: t.String(),
      provider: t.String(),
      url: t.Union([t.String({ format: 'uri' }), t.Null()]),
      retrieved_at: t.String({ format: 'date-time' }),
    }),
  ),
  limitations: t.Array(t.String()),
  steps: t.Array(workflow_step),
})

export const dto_ai = {
  analyze: {
    body: t.Object(
      {
        prompt: t.String({ minLength: 1, maxLength: 4000, pattern: '\\S' }),
        user_id: t.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
      },
      { additionalProperties: false },
    ),
    response: t.Object({ data: dto_schema_ai_result }),
  },
}
