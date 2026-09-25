import { Elysia } from 'elysia'

import { z } from 'zod'

import { ai_request_timeout_seconds } from '@ai/runtime.ai'

import { enum_tenant_type } from '@lib/enum.lib'
import { lib_error } from '@lib/error.lib'
import { lib_jwt } from '@lib/jwt.lib'

import { dto_ai } from '@module/main/ai/ai.dto'
import { service_ai } from '@module/main/ai/ai.service'

type analyze_service = Pick<typeof service_ai, 'analyze'>['analyze']

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

// TEMPORARY: remove this static test harness when the real frontend owns the workflow UI.
const serve_ai_test_asset = (path: string, content_type: string) => {
  if (process.env.ENV !== 'dev') return new Response('Not Found', { status: 404 })
  return new Response(Bun.file(path), {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': content_type,
    },
  })
}

const stream_ai_analysis = (
  analyze: analyze_service,
  body: Parameters<analyze_service>[0],
  payload: Parameters<analyze_service>[1],
  request_signal: AbortSignal,
) => {
  const encoder = new TextEncoder()
  const stream_abort = new AbortController()
  const signal = AbortSignal.any([request_signal, stream_abort.signal])
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          closed = true
          stream_abort.abort(new DOMException('Event stream closed', 'AbortError'))
        }
      }

      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(': heartbeat\n\n'))
      }, 15_000)

      void analyze(body, payload, signal, (step) => send('step', step))
        .then((result) => send('result', result))
        .catch(() => send('error', { message: 'The analysis workflow could not be completed.' }))
        .finally(() => {
          if (heartbeat) clearInterval(heartbeat)
          if (!closed) {
            closed = true
            controller.close()
          }
        })
    },
    cancel() {
      closed = true
      if (heartbeat) clearInterval(heartbeat)
      stream_abort.abort(new DOMException('Event stream cancelled', 'AbortError'))
    },
  })

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    },
  })
}

export const create_controller_ai = (service: Pick<typeof service_ai, 'analyze'> = service_ai) =>
  new Elysia({ prefix: '/ai' }) /* /ai/analyse */
    .use(lib_jwt)
    .get('/test', () => serve_ai_test_asset('public/ai-test.html', 'text/html; charset=utf-8'))
    .get('/test.css', () => serve_ai_test_asset('public/ai-test.css', 'text/css; charset=utf-8'))
    .get('/test.js', () => serve_ai_test_asset('public/ai-test.js', 'text/javascript; charset=utf-8'))
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
      async ({ body, payload, request, server }) => {
        if (body.user_id !== payload.user_id) throw lib_error.unauthorized
        server?.timeout(request, ai_request_timeout_seconds)
        if (request.headers.get('Accept')?.includes('text/event-stream')) {
          return stream_ai_analysis(service.analyze, body, payload, request.signal)
        }
        return await service.analyze(body, payload, request.signal)
      },
      dto_ai.analyze,
    )

export const controller_ai = create_controller_ai()
