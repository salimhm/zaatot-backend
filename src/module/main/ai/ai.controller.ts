import { Elysia } from 'elysia'

import { z } from 'zod'

import { enum_tenant_type } from '@lib/enum.lib'
import { lib_error } from '@lib/error.lib'
import { lib_jwt } from '@lib/jwt.lib'

import { dto_ai } from '@module/main/ai/ai.dto'
import { service_ai } from '@module/main/ai/ai.service'

const schema_payload = z.object({
  user_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  tenants: z
    .array(
      z.object({
        tenant_id: z.number().int().positive(),
        tenant_type: z.enum(enum_tenant_type),
        tenant_schema_version: z.string(),
      }),
    )
    .optional(),
})

export const create_controller_ai = (service: Pick<typeof service_ai, 'analyze'> = service_ai) =>
  new Elysia({ prefix: '/ai' }) /* /ai/analyse */
    .use(lib_jwt)
    .derive(async ({ headers, jwt }) => {
      const match = headers.authorization?.match(/^Bearer ([^\s]+)$/i)
      if (!match) throw lib_error.invalid_token
      let verified: unknown
      try {
        verified = await jwt.verify(match[1])
      } catch {
        throw lib_error.invalid_token
      }
      const payload = schema_payload.safeParse(verified)
      if (!payload.success) throw lib_error.invalid_token
      return { payload: payload.data }
    })
    .post(
      '/analyze',
      async ({ body, payload, request }) => {
        if (body.user_id !== payload.user_id) throw lib_error.unauthorized
        return await service.analyze(body, payload, request.signal)
      },
      dto_ai.analyze,
    )

export const controller_ai = create_controller_ai()
