import type { Static } from 'elysia'

import { dto_boycott_decision } from '@module/main/boycott-decision/boycott-decision.dto'
import { provider_boycott_knowledge } from '@module/main/boycott-decision/provider/boycott-knowledge.provider'
import { calculate_decision_confidence, is_active_boycott_claim } from '@module/main/boycott-decision/utils/confidence.util'
import { find_best_knowledge_match } from '@module/main/boycott-decision/utils/entity-match.util'
import { build_decision_reason } from '@module/main/boycott-decision/utils/reason.util'

export const service_boycott_decision = {
  async decide(body: Static<typeof dto_boycott_decision.decide.body>): Promise<Static<typeof dto_boycott_decision.decide.response>> {
    const candidate_names = [body.product_brand_name, body.product_company_name, body.product_name, ...(body.candidate_names || [])].filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    )

    if (candidate_names.length === 0 && !body.product_website_url) {
      return {
        data: {
          decision_status: 'unknown',
          confidence: 0,
          reason: build_decision_reason({ status: 'unknown', match: null, confidence: 0 }),
          matched_entity: null,
          matched_path: [],
          sources: [],
          alternatives: [],
        },
      }
    }

    const items = await provider_boycott_knowledge.get_knowledge_items()
    const match = find_best_knowledge_match({
      items,
      candidate_names,
      website_url: body.product_website_url,
    })

    if (!match || match.match_score < 55) {
      return {
        data: {
          decision_status: 'unknown',
          confidence: match ? match.match_score : 0,
          reason: build_decision_reason({ status: 'unknown', match, confidence: match ? match.match_score : 0 }),
          matched_entity: match
            ? {
                entity_type: match.entity_type,
                name: match.entity_name,
                matched_name: match.matched_name,
                match_type: match.match_type,
                match_score: match.match_score,
              }
            : null,
          matched_path: match?.matched_path || [],
          sources: [],
          alternatives: [],
        },
      }
    }

    const confidence = calculate_decision_confidence(match)
    const has_active_boycott_claim = is_active_boycott_claim(match.item)
    const decision_status = has_active_boycott_claim
      ? confidence >= 80
        ? 'boycott'
        : 'needs_review'
      : match.match_score >= 85
        ? 'not_boycotted'
        : 'needs_review'

    return {
      data: {
        decision_status,
        confidence,
        reason: build_decision_reason({ status: decision_status, match, confidence }),
        matched_entity: {
          entity_type: match.entity_type,
          name: match.entity_name,
          matched_name: match.matched_name,
          match_type: match.match_type,
          match_score: match.match_score,
        },
        matched_path: match.matched_path,
        sources: match.item.evidence.map((evidence) => ({
          source_name: match.item.source.source_name,
          source_url: match.item.source.source_url,
          title: evidence.title,
          url: evidence.url,
          quote: evidence.quote,
        })),
        alternatives: match.item.alternatives,
      },
    }
  },
}
