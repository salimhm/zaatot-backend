import type { Static } from 'elysia'

import { dto_schema_boycott_knowledge_item } from '@module/main/boycott-decision/boycott-decision.dto'

export type boycott_knowledge_item = Static<typeof dto_schema_boycott_knowledge_item>

export type boycott_source_provider = {
  get_knowledge_items(): Promise<boycott_knowledge_item[]>
}
