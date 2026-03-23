import './config/validateEnv'
import {
  type Context,
  type Env,
  Hono,
  type MiddlewareHandler,
  type Next,
} from 'hono'
import { rateLimiter } from 'hono-rate-limiter'
import { serveStatic } from 'hono/bun'
import { cors } from 'hono/cors'
import { csrf } from 'hono/csrf'
import { timeout } from 'hono/timeout'
import { trimTrailingSlash } from 'hono/trailing-slash'
import { env } from './config/env'
import { API, SHUTDOWN_SIGNALS } from './constants'
import {
  authors,
  books,
  bookSearchOptions,
  cms,
  logs,
  news,
  orders,
  payments,
  users,
  webhooks,
} from './controller'
import { mongo, sqliteClient } from './db'
import { closeMailer, initMailer, log } from './libs'
import {
  authAdminMiddleware,
  authMiddleware,
  optionalAuthMiddleware,
  payloadLimiter,
  paymentAccessMiddleware,
} from './middleware'
import { emailQueue } from './queues'
import { DB_REPO } from './types/enums'
import {
  closeNgrokTunnel,
  formatUptime,
  ngrokForward,
  shortHash,
} from './utils'

const app = new Hono()
const api = new Hono()

const limiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  message: { error: 'Too many requests' },
  statusCode: 429,
  standardHeaders: 'draft-6',
  keyGenerator: (c) => {
    const forwarded =
      c.req.header('CF-Connecting-IP') ??
      c.req.header('X-Forwarded-For') ??
      c.req.header('X-Real-Ip')

    const forwardedIp = forwarded ? forwarded.split(',')[0]!.trim() : 'unknown'

    const userAgent = c.req.header('User-Agent') ?? ''
    const acceptLanguage = c.req.header('Accept-Language') ?? ''
    const fingerprint = shortHash(`${userAgent}|${acceptLanguage}`)

    return `${forwardedIp}:${fingerprint}`
  },
})

const corsMiddleware = cors({
  origin: env.clientBaseUrl!,
  allowHeaders: ['authorization', 'content-type', 'ngrok-skip-browser-warning'],
  allowMethods: ['GET', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
})

app.use('*', async (c, next) => {
  try {
    await next()
  } catch (error: unknown) {
    log.error(`${c.req.method} ${c.req.url}`, { error })
    throw error
  }
})

app.use(limiter)
app.use(trimTrailingSlash())
app.use('*', corsMiddleware)
app.use('*', payloadLimiter)
app.use('*', timeout(10000))
app.use(API.favicon, serveStatic({ path: './static/favicon.ico' }))

if (Bun.env.NODE_ENV === 'production') {
  const csrfMiddleware: MiddlewareHandler = csrf({
    origin: [env.clientBaseUrl!],
  })

  app.use('*', async (c: Context<Env, string, object>, next: Next) => {
    if (c.req.path.startsWith(API.webhooks.root)) return next()
    return csrfMiddleware(c, next)
  })
}

app.get(API.root, (c) => {
  return c.html(
    `<h2>Bookshop Backend</h2>
    <p>Uptime: ${formatUptime(Bun.nanoseconds())}</p>
    <p>Your IP: ${c.req.header('X-Forwarded-For') ?? c.req.header('X-Real-Ip') ?? 'unknown'}</p>`,
  )
})

app.get(API.health, (c) => c.text('OK', 200))

api.use(API.users.profile, authMiddleware)
api.use(API.users.logout, authMiddleware)
api.use(API.users.avatar, authMiddleware)
api.use(API.orders.root, authMiddleware)
api.use(API.payments.root, optionalAuthMiddleware)
api.use(API.payments.byId, paymentAccessMiddleware)
api.use(API.payments.byIdWildcard, paymentAccessMiddleware)
api.use(API.cms.wildcard, authAdminMiddleware)

api.route(API.root, books)
api.route(API.root, authors)
api.route(API.root, news)
api.route(API.root, bookSearchOptions)
api.route(API.root, users)
api.route(API.root, orders)
api.route(API.root, payments)
api.route(API.root, cms)
api.route(API.root, logs)

app.route(API.api, api)
app.route(API.webhooks.root, webhooks)

let httpServer: Bun.Server<undefined> | undefined
let shuttingDown = false
const SHUTDOWN_TIMEOUT_MS = 10_000

if (import.meta.main) {
  const port = Number(env.port)

  httpServer = Bun.serve({
    fetch: app.fetch,
    port,
    hostname: '0.0.0.0',
  })

  log.info('🟢 Server started', {
    hostname: httpServer.hostname,
    port: httpServer.port,
  })

  void initMailer()

  if (env.ngrokAuthToken) void ngrokForward()

  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      void shutdownApp(signal)
    })
  }
}

async function shutdownApp(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true

  log.info('🟡 Server shutting down...', { signal })

  let hasShutdownError = false
  let shutdownTimeoutId: ReturnType<typeof setTimeout> | undefined

  const shutdownRoutine = async (): Promise<void> => {
    if (httpServer) {
      await httpServer
        .stop(true)
        .catch((error: unknown) => {
          hasShutdownError = true
          log.error('⚠️ Failed to stop HTTP server', { signal, error })
        })
        .finally(() => {
          log.info('🔴 HTTP server stopped', { signal })
        })
    }

    await emailQueue.close().catch((error: unknown) => {
      hasShutdownError = true
      log.error('⚠️ Failed to close email queue', { signal, error })
    })

    if (env.dbRepo === DB_REPO.SQLITE) {
      try {
        sqliteClient?.close()
      } catch (error: unknown) {
        hasShutdownError = true
        log.error('⚠️ SQLite client close threw unexpectedly', {
          signal,
          error,
        })
      }
    } else if (env.dbRepo === DB_REPO.MONGO) {
      await mongo.connection.close().catch((error: unknown) => {
        hasShutdownError = true
        log.error('⚠️ Failed to close Mongo connection', { signal, error })
      })
    }

    await closeNgrokTunnel().catch((error: unknown) => {
      hasShutdownError = true
      log.error('⚠️ Failed to close ngrok tunnel', { signal, error })
    })

    try {
      closeMailer()
    } catch (error: unknown) {
      hasShutdownError = true
      log.error('⚠️ Failed to close mailer transporter', { signal, error })
    }
  }

  const shutdownTimeout = new Promise<'timed-out'>((resolve) => {
    shutdownTimeoutId = setTimeout(() => {
      hasShutdownError = true
      log.error('⚠️ Shutdown timeout reached; forcing process exit', {
        signal,
        timeoutMs: SHUTDOWN_TIMEOUT_MS,
      })
      resolve('timed-out')
    }, SHUTDOWN_TIMEOUT_MS)
  })

  try {
    await Promise.race([shutdownRoutine(), shutdownTimeout])
  } catch (error: unknown) {
    hasShutdownError = true
    log.error('⚠️ Unexpected shutdown error', { signal, error })
  } finally {
    if (shutdownTimeoutId) clearTimeout(shutdownTimeoutId)
    process.exit(hasShutdownError ? 1 : 0)
  }
}
