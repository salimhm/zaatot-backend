import type { boycott_source_provider } from '@module/main/boycott-decision/source/source.types'

import { boycott_decision_seed } from '@module/main/boycott-decision/boycott-decision.seed'

export const provider_boycott_knowledge: boycott_source_provider = {
  async get_knowledge_items() {
    return boycott_decision_seed
  },
}
