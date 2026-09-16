import { t } from 'elysia'

import { consumer_agent_names } from '@ai/src/workflow.definition'

const product = t.Object({
  barcode: t.Union([t.String(), t.Null()]),
  name: t.String({ minLength: 1 }),
  brand: t.Union([t.String(), t.Null()]),
})

export const dto_schema_ai_result = t.Object({
  execution_id: t.String({ format: 'uuid' }),
  status: t.UnionEnum(['completed', 'partial', 'blocked', 'needs_input', 'needs_review', 'error']),
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
