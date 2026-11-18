import { serveStatic } from '@hono/bun'
import { Hono } from 'hono'
import type { Store } from 'hono-rate-limiter'
import { cors } from 'hono/cors'
import { timeout } from 'hono/timeout'
import { trimTrailingSlash } from 'hono/trailing-slash'
import { isDatabaseReady } from '@/db'
import { env } from '@/config/env'
import {
  authors,
  books,
  bookSearchOptions,
  cms,
  logs,
  news,
  orders,
  payments,
  terms,
  users,
  webhooks,
} from '@/controller'
import {
  authAdminMiddleware,
  authMiddleware,
  createCsrfMiddleware,
  createRateLimitMiddleware,
  googleSignInMiddleware,
  optionalAuthMiddleware,
  payloadLimiter,
  paymentAccessMiddleware,
} from '@/middleware'
import { formatUptime } from '@/utils/date.utils'
import { httpPolicy } from '@/constants/http'
import { API } from '@/constants/paths'
import { errorHandler } from '@/errors/errorHandler'
import { HttpErrorCode } from '@/types/enums'

export function createApp(
  isReady: () => boolean = isDatabaseReady,
  rateLimitStore?: Store,
) {
  const app = new Hono()
  const api = new Hono()

  app.get(API.health, (c) => c.text('OK', 200))

  app.get(API.ready, (c) => {
    const ready = isReady()

    return c.text(ready ? 'READY' : 'NOT READY', ready ? 200 : 503)
  })

  app.onError((error, c) => errorHandler(c, error))
  app.notFound((c) => c.json({ code: HttpErrorCode.NotFound }, 404))

  const corsMiddleware = cors({
    origin: env.clientBaseUrl!,
    allowHeaders: [
      'authorization',
      'content-type',
      'idempotency-key',
      'ngrok-skip-browser-warning',
    ],
    allowMethods: ['GET', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  })

  app.use(
    '*',
    createRateLimitMiddleware(rateLimitStore),
    trimTrailingSlash(),
    corsMiddleware,
    payloadLimiter,
    timeout(httpPolicy.requestTimeoutMs),
  )
  app.use(API.favicon, serveStatic({ path: './static/favicon.ico' }))

  if (Bun.env.NODE_ENV === 'production') {
    app.use('*', createCsrfMiddleware())
  }

  app.get(API.root, (c) => {
    const clientIp = Bun.escapeHTML(
      c.req.header('X-Forwarded-For') ?? c.req.header('X-Real-Ip') ?? 'unknown',
    )

    return c.html(
      `<h2>Bookshop Backend</h2>
      <p>Uptime: ${formatUptime(Bun.nanoseconds())}</p>
      <p>Your IP: ${clientIp}</p>`,
    )
  })

  api.use(API.users.profile, authMiddleware)
  api.use(API.users.avatar, authMiddleware)
  api.use(`${API.users.google}/*`, googleSignInMiddleware)

  api.use(API.orders.root, authMiddleware)

  api.use(API.payments.root, optionalAuthMiddleware)
  api.use(
    `${API.payments.byId}/*`,
    optionalAuthMiddleware,
    paymentAccessMiddleware,
  )

  api.use(`${API.cms.root}/*`, authAdminMiddleware)

  api.route(API.root, books)
  api.route(API.root, authors)
  api.route(API.root, news)
  api.route(API.root, bookSearchOptions)
  api.route(API.root, users)
  api.route(API.root, orders)
  api.route(API.root, payments)
  api.route(API.root, terms)
  api.route(API.root, cms)
  api.route(API.root, logs)

  app.route(API.api, api)
  app.route(API.webhooks.root, webhooks)

  return app
}
