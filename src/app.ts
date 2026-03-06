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
import { SHUTDOWN_SIGNALS } from './constants'
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
import { log } from './libs'
import {
  authAdminMiddleware,
  authMiddleware,
  optionalAuthMiddleware,
  payloadLimiter,
  paymentAccessMiddleware,
} from './middleware'
import { emailQueue } from './queues'
import { DB_REPO } from './types/enums'
import { closeNgrokTunnel, formatUptime, ngrokForward } from './utils'

const app = new Hono()
const api = new Hono()

const limiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  message: { error: 'Too many requests' },
  statusCode: 429,
  standardHeaders: 'draft-6',
  keyGenerator: (c) =>
    c.req.header('X-Forwarded-For') ?? c.req.header('X-Real-Ip') ?? 'unknown',
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
app.use('/favicon.ico', serveStatic({ path: './static/favicon.ico' }))

if (Bun.env.NODE_ENV === 'production') {
  const csrfMiddleware: MiddlewareHandler = csrf({
    origin: [env.clientBaseUrl!],
  })

  app.use('*', async (c: Context<Env, string, object>, next: Next) => {
    if (c.req.path.startsWith('/webhooks')) return next()
    return csrfMiddleware(c, next)
  })
}

app.get('/', (c) => {
  return c.html(
    `<h2>Bookshop Backend</h2>
    <p>Uptime: ${formatUptime(Bun.nanoseconds())}</p>
    <p>Your IP: ${c.req.header('X-Forwarded-For') ?? c.req.header('X-Real-Ip') ?? 'unknown'}</p>`,
  )
})

app.get('/health', (c) => c.text('OK', 200))

api.use('/users/profile', authMiddleware)
api.use('/users/logout', authMiddleware)
api.use('/users/avatar', authMiddleware)
api.use('/orders', authMiddleware)
api.use('/payments', optionalAuthMiddleware)
api.use('/payments/:paymentId', paymentAccessMiddleware)
api.use('/payments/:paymentId/*', paymentAccessMiddleware)
api.use('/cms/*', authAdminMiddleware)

api.route('/books', books)
api.route('/authors', authors)
api.route('/news', news)
api.route('/search_opts', bookSearchOptions)
api.route('/users', users)
api.route('/orders', orders)
api.route('/payments', payments)
api.route('/cms', cms)
api.route('/logs', logs)

app.route('/api', api)
app.route('/webhooks', webhooks)

if (env.ngrokAuthToken) void ngrokForward()

let httpServer: Bun.Server<undefined> | undefined
let shuttingDown = false

if (import.meta.main) {
  const port = Number(env.port)

  httpServer = Bun.serve({
    fetch: app.fetch,
    port,
    hostname: '0.0.0.0',
  })

  log.info('Server started', {
    hostname: httpServer.hostname,
    port: httpServer.port,
  })
}

async function shutdownApp(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true

  log.info('Server shutting down', { signal })

  let hasShutdownError = false

  if (httpServer) {
    await httpServer.stop(true).catch((error: unknown) => {
      hasShutdownError = true
      log.error('Failed to stop HTTP server', { signal, error })
    })
  }

  await emailQueue.close().catch((error: unknown) => {
    hasShutdownError = true
    log.error('Failed to close email queue', { signal, error })
  })

  if (env.dbRepo === DB_REPO.SQLITE) {
    sqliteClient?.close()
  } else if (env.dbRepo === DB_REPO.MONGO) {
    await mongo.connection.close().catch((error: unknown) => {
      hasShutdownError = true
      log.error('Failed to close Mongo connection', { signal, error })
    })
  }

  await closeNgrokTunnel().catch((error: unknown) => {
    hasShutdownError = true
    log.error('Failed to close ngrok tunnel', { signal, error })
  })

  process.exit(hasShutdownError ? 1 : 0)
}

for (const signal of SHUTDOWN_SIGNALS) {
  process.once(signal, () => {
    void shutdownApp(signal)
  })
}

export default app
