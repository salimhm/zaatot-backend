import type { lib_dto_payload } from '@lib/dto.lib'
import type { Static } from 'elysia'

import { run_consumer_workflow } from '@ai/workflow.ai'

import { lib_error } from '@lib/error.lib'

import { dto_ai } from '@module/main/ai/ai.dto'

export const service_ai = {
  async analyze(
    body: Static<typeof dto_ai.analyze.body>,
    payload: lib_dto_payload,
    signal?: AbortSignal,
  ): Promise<Static<typeof dto_ai.analyze.response>> {
    if (!Number.isSafeInteger(payload.user_id) || payload.user_id <= 0 || body.user_id !== payload.user_id) throw lib_error.unauthorized
    return { data: await run_consumer_workflow({ ...body, user_id: payload.user_id }, { signal }) }
  },
}
