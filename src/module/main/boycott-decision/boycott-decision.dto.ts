import { t } from 'elysia'

import {
  enum_boycott_campaign_tier,
  enum_boycott_claim_status,
  enum_boycott_claim_type,
  enum_boycott_decision_status,
  enum_boycott_entity_type,
  enum_boycott_match_type,
  enum_boycott_relationship_type,
  enum_boycott_source_type,
} from '@lib/enum.lib'

export const dto_schema_boycott_source = t.Object({
  source_id: t.String(),
  source_name: t.String(),
  source_url: t.String(),
  source_type: t.UnionEnum(enum_boycott_source_type),
  trust_score: t.Number({ minimum: 0, maximum: 100 }),
  fetched_at: t.Optional(t.String()),
})

export const dto_schema_boycott_entity = t.Object({
  entity_type: t.UnionEnum(enum_boycott_entity_type),
  name: t.String(),
  aliases: t.Array(t.String()),
  website_url: t.Optional(t.Union([t.String(), t.Null()])),
  country_codes: t.Optional(t.Array(t.String())),
  category_tags: t.Optional(t.Array(t.String())),
})

export const dto_schema_boycott_claim = t.Object({
  claim_type: t.UnionEnum(enum_boycott_claim_type),
  status: t.UnionEnum(enum_boycott_claim_status),
  reason: t.Optional(t.Union([t.String(), t.Null()])),
  tier: t.Optional(t.Union([t.UnionEnum(enum_boycott_campaign_tier), t.Null()])),
})

export const dto_schema_boycott_related_entity = t.Object({
  relationship_type: t.UnionEnum(enum_boycott_relationship_type),
  entity_type: t.UnionEnum(enum_boycott_entity_type),
  name: t.String(),
  aliases: t.Optional(t.Array(t.String())),
  website_url: t.Optional(t.Union([t.String(), t.Null()])),
})

export const dto_schema_boycott_evidence = t.Object({
  title: t.Optional(t.String()),
  url: t.String(),
  quote: t.Optional(t.String()),
  published_at: t.Optional(t.String()),
})

export const dto_schema_boycott_alternative = t.Object({
  name: t.String(),
  website_url: t.Optional(t.String()),
  description: t.Optional(t.String()),
})

export const dto_schema_boycott_knowledge_item = t.Object({
  source: dto_schema_boycott_source,
  entity: dto_schema_boycott_entity,
  claim: dto_schema_boycott_claim,
  related_entities: t.Array(dto_schema_boycott_related_entity),
  evidence: t.Array(dto_schema_boycott_evidence),
  alternatives: t.Array(dto_schema_boycott_alternative),
  confidence: t.Number({ minimum: 0, maximum: 100 }),
})

export const dto_schema_boycott_match = t.Object({
  entity_type: t.UnionEnum(enum_boycott_entity_type),
  name: t.String(),
  matched_name: t.String(),
  match_type: t.UnionEnum(enum_boycott_match_type),
  match_score: t.Number({ minimum: 0, maximum: 100 }),
})

export const dto_schema_boycott_decision_source = t.Object({
  source_name: t.String(),
  source_url: t.String(),
  title: t.Optional(t.String()),
  url: t.String(),
  quote: t.Optional(t.String()),
})

export const dto_boycott_decision = {
  decide: {
    body: t.Object({
      product_name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
      product_brand_name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
      product_company_name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
      product_website_url: t.Optional(t.String({ minLength: 1, maxLength: 1024 })),
      product_category_tags: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 128 }))),
      candidate_names: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 255 }))),
    }),
    response: t.Object({
      data: t.Object({
        decision_status: t.UnionEnum(enum_boycott_decision_status),
        confidence: t.Number({ minimum: 0, maximum: 100 }),
        reason: t.String(),
        matched_entity: t.Union([dto_schema_boycott_match, t.Null()]),
        matched_path: t.Array(t.String()),
        sources: t.Array(dto_schema_boycott_decision_source),
        alternatives: t.Array(dto_schema_boycott_alternative),
      }),
    }),
  },
}
