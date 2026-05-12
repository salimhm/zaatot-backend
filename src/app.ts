import { Elysia } from 'elysia'

import { cors } from '@elysiajs/cors'
import { jwt } from '@elysiajs/jwt'
import { swagger } from '@elysiajs/swagger'

import { controller_auth } from '@module/main/auth/auth.controller'
import { controller_tenant } from '@module/main/tenant/tenant.controller'
import { service_tenant } from '@module/main/tenant/tenant.service'
import { controller_user } from '@module/main/user/user.controller'
import { controller_access } from '@module/tenant/access/access.controller'
import { controller_contact } from '@module/tenant/contact/contact.controller'
import { controller_file } from '@module/tenant/file/file.controller'

const app_name = process.env.NAME || 'Elysia'
const app_env = process.env.ENV || 'UNDEFINED'
const port = Number(process.env.PORT) || 3000

export const app = new Elysia()

  .use(cors())

  .use(swagger({ path: '/swagger' }))

  .use(
    jwt({
      secret: process.env.JWT_SECRET_KEY!,
    }),
  )

  .get('/', () => {
    return new Response(`<h1>🔥 ${process.env.NAME} 🔥`, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  })

  .get('/eden', () => {
    if (app_env === 'production') return new Response('Not Found', { status: 404 })
    const file = Bun.file('public/eden.ts')
    return new Response(file, {
      headers: { 'Content-Type': 'application/x-typescript' },
    })
  })

  .onBeforeHandle(async ({ params, query, body }) => {
    const p = (params || {}) as any
    const q = (query || {}) as any
    const b = (body || {}) as any

    const tenant_id = p.tenant_id || q.tenant_id || b.tenant_id
    if (!tenant_id) return

    await service_tenant.migrate_schema(Number(tenant_id))
  })

  .use(controller_auth)

  .group('', (app) =>
    app
      .onBeforeHandle(async ({ headers: { authorization }, jwt }) => {
        if (!authorization) throw { code: 'invalid token', status: 401 }

        const token = authorization.split(' ')[1]

        if (!token) throw { code: 'invalid token', status: 401 }

        const payload = await jwt.verify(token)

        if (!payload) throw { code: 'invalid token', status: 401 }
      })

      .derive(async ({ headers: { authorization }, jwt }) => {
        if (!authorization) throw { code: 'invalid token', status: 401 }

        const token = authorization.split(' ')[1]

        if (!token) throw { code: 'invalid token', status: 401 }

        const payload = await jwt.verify(token)

        if (!payload) throw { code: 'invalid token', status: 401 }

        return {
          payload,
        }
      })

      .use(controller_user)
      .use(controller_file)
      .use(controller_contact)
      .use(controller_tenant)
      .use(controller_access),
  )

  .listen(port)

export type App = typeof app

console.log(`🦊 ${app_name} ${app_env} is running at ${app.server?.hostname}:${app.server?.port}`)
