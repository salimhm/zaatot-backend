import type { boycott_match_result } from '@module/main/boycott-decision/utils/entity-match.util'
import type { Static } from 'elysia'

import { dto_boycott_decision } from '@module/main/boycott-decision/boycott-decision.dto'

type decision_response_data = Static<typeof dto_boycott_decision.decide.response>['data']

export function build_decision_reason(options: {
  status: decision_response_data['decision_status']
  match: boycott_match_result | null
  confidence: number
}): string {
  const { status, match, confidence } = options

  if (!match) {
    return 'No reliable brand or company match was found in the current boycott knowledge seed. Add more product, brand, company or alias data to improve this result.'
  }

  const item = match.item
  const tier = item.claim.tier ? `${item.claim.tier} ` : ''
  const reason = item.claim.reason ? ` Reason: ${item.claim.reason}` : ''

  if (status === 'boycott') {
    return `Matched ${match.entity_name} to ${item.entity.name}. ${item.source.source_name} lists this as an active ${tier}${item.claim.claim_type.replace(/_/g, ' ')} claim with ${confidence}% confidence.${reason}`
  }

  if (status === 'needs_review') {
    return `Possible match found for ${match.entity_name}, but the confidence is ${confidence}%. This should be reviewed before showing a firm boycott decision.${reason}`
  }

  if (status === 'not_boycotted') {
    return `Matched ${match.entity_name}, but the current knowledge seed has no active boycott claim for it. This means no matching evidence was found in our current data, not that the brand is certified safe.`
  }

  return `A weak or incomplete match was found for ${match.entity_name}, but the current data is not enough to make a decision.`
}
