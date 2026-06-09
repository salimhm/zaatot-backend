import '@lib/env.lib'

import { Elysia } from 'elysia'

import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'

import { close_all_connections } from '@db/client.db'

import { handle_error } from '@lib/error.lib'
import { lib_jwt } from '@lib/jwt.lib'
import { apply_rate_limit, apply_security_headers, apply_tenant_migration, derive_auth, guard_auth } from '@lib/middleware.lib'

import { storage_object_main } from '@storage/client.storage'

import { controller_auth } from '@module/main/auth/auth.controller'
import { controller_organization } from '@module/main/organization/organization.controller'
import { controller_user } from '@module/main/user/user.controller'
import { controller_contact } from '@module/organization/contact/contact.controller'
import { controller_access } from '@module/tenant/access/access.controller'
import { controller_file } from '@module/tenant/file/file.controller'

const app_name = process.env.NAME || 'Elysia'
const app_env = process.env.ENV || 'UNDEFINED'
const port = Number(process.env.PORT) || 3000
const request_timeout = Number(process.env.REQUEST_TIMEOUT) || 60

export const app = new Elysia({
  serve: {
    idleTimeout: request_timeout,
  },
})

  .use(
    cors({
      credentials: true,
      exposeHeaders: ['X-Refresh-Token'],
    }),
  )

  .use(app_env === 'dev' ? swagger({ path: '/swagger' }) : (app) => app)

  .use(lib_jwt)

  .onBeforeHandle(apply_rate_limit)

  .onAfterHandle(apply_security_headers)

  .onError(handle_error)

  .get('/', () => {
    return new Response(`<h1>🔥 ${process.env.NAME} 🔥`, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  })

  .get('/eden', () => {
    if (app_env !== 'dev') return new Response('Not Found', { status: 404 })
    const file = Bun.file('public/eden.ts')
    return new Response(file, {
      headers: { 'Content-Type': 'application/x-typescript' },
    })
  })

  .use(controller_auth)

  .group('', (app) =>
    app
      .derive(derive_auth)
      .onBeforeHandle(guard_auth)
      .onBeforeHandle(apply_tenant_migration)
      .use(controller_user)
      .use(controller_file)
      .use(controller_contact)
      .use(controller_organization)
      .use(controller_access),
  )

  .listen(port)

export type App = typeof app

console.log(`🦊 ${app_name} ${app_env} is running at ${app.server?.hostname}:${app.server?.port}`)

let is_shutting_down = false

const handle_shutdown = async () => {
  if (is_shutting_down) return
  is_shutting_down = true

  setTimeout(() => process.exit(1), 30_000).unref()

  try {
    await app.stop()
  } finally {
    close_all_connections()
    storage_object_main.destroy()
    process.exit(0)
  }
}

process.on('SIGTERM', handle_shutdown)
process.on('SIGINT', handle_shutdown)
