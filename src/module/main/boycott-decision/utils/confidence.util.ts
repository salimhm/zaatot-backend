import type { boycott_knowledge_item } from '@module/main/boycott-decision/source/source.types'
import type { boycott_match_result } from '@module/main/boycott-decision/utils/entity-match.util'

import { enum_boycott_campaign_tier } from '@lib/enum.lib'

const tier_bonus: Record<(typeof enum_boycott_campaign_tier)[number], number> = {
  priority: 6,
  organic: 3,
  pressure: 2,
  evidence: 0,
  community: -8,
}

export function is_active_boycott_claim(item: boycott_knowledge_item): boolean {
  return item.claim.status === 'active' && ['boycott_target', 'risk_evidence'].includes(item.claim.claim_type)
}

export function calculate_decision_confidence(match: boycott_match_result): number {
  const tier = match.item.claim.tier
  const bonus = tier ? tier_bonus[tier] : 0
  const weighted = match.match_score * 0.45 + match.item.source.trust_score * 0.3 + match.item.confidence * 0.25 + bonus

  return Math.max(0, Math.min(100, Math.round(weighted)))
}
