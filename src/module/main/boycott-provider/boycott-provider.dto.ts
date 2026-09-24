import { t } from 'elysia'

import { enum_boycott_decision_status, enum_boycott_entity_type, enum_boycott_match_type } from '@lib/enum.lib'

export const enum_boycott_provider_name = ['boycat'] as const

export const enum_boycott_provider_status = ['matched', 'not_found', 'ambiguous', 'unavailable', 'invalid_response'] as const

export const dto_schema_boycott_provider_campaign_tier = t.Object({
  level: t.Optional(t.Number()),
  title: t.Optional(t.String()),
  description: t.Optional(t.String()),
})

export const dto_schema_boycott_provider_campaign = t.Object({
  name: t.Optional(t.String()),
  reasoning: t.Optional(t.String()),
  source: t.Optional(t.String()),
  created_at: t.Optional(t.String()),
  tier: t.Optional(t.Union([dto_schema_boycott_provider_campaign_tier, t.Null()])),
})

export const dto_schema_boycott_provider_match = t.Object({
  entity_type: t.UnionEnum(enum_boycott_entity_type),
  name: t.String(),
  matched_name: t.String(),
  match_type: t.UnionEnum(enum_boycott_match_type),
  match_score: t.Number({ minimum: 0, maximum: 100 }),
})

export const dto_schema_boycott_provider_source = t.Object({
  source_name: t.String(),
  source_url: t.String(),
  title: t.Optional(t.String()),
  url: t.String(),
  quote: t.Optional(t.String()),
})

export const dto_schema_boycott_provider_alternative = t.Object({
  name: t.String(),
  image_url: t.Optional(t.String()),
  description: t.Optional(t.String()),
})

export const dto_schema_boycott_provider_search_result = t.Object({
  brand_name: t.String(),
  campaign_name: t.Optional(t.String()),
  campaign_tier: t.Optional(t.Number()),
  decision_status: t.UnionEnum(enum_boycott_decision_status),
  confidence: t.Number({ minimum: 0, maximum: 100 }),
  reason: t.String(),
})

export const dto_schema_boycott_provider_search = t.Object({
  provider: t.UnionEnum(enum_boycott_provider_name),
  provider_status: t.UnionEnum(enum_boycott_provider_status),
  query: t.String(),
  results: t.Array(dto_schema_boycott_provider_search_result),
})

export const dto_schema_boycott_provider_decision = t.Object({
  provider: t.UnionEnum(enum_boycott_provider_name),
  provider_status: t.UnionEnum(enum_boycott_provider_status),
  requested_name: t.Optional(t.String()),
  provider_matched_name: t.Optional(t.Union([t.String(), t.Null()])),
  identity_candidates: t.Optional(t.Array(t.String())),
  decision_status: t.UnionEnum(enum_boycott_decision_status),
  confidence: t.Number({ minimum: 0, maximum: 100 }),
  reason: t.String(),
  matched_entity: t.Union([dto_schema_boycott_provider_match, t.Null()]),
  campaigns: t.Array(dto_schema_boycott_provider_campaign),
  sources: t.Array(dto_schema_boycott_provider_source),
  alternatives: t.Array(dto_schema_boycott_provider_alternative),
})

export const dto_boycott_provider = {
  search: {
    body: t.Object({
      provider: t.Optional(t.UnionEnum(enum_boycott_provider_name)),
      query: t.String({ minLength: 1, maxLength: 255 }),
    }),
    response: t.Object({
      data: dto_schema_boycott_provider_search,
    }),
  },
  decide: {
    body: t.Object({
      provider: t.Optional(t.UnionEnum(enum_boycott_provider_name)),
      brand_name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
      product_brand_name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
      product_name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
    }),
    response: t.Object({
      data: dto_schema_boycott_provider_decision,
    }),
  },
}
