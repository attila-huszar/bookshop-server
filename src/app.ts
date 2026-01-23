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
import { logger } from 'hono/logger'
import { timeout } from 'hono/timeout'
import { trimTrailingSlash } from 'hono/trailing-slash'
import { env } from './config/env'
import {
  authors,
  books,
  bookSearchOptions,
  cms,
  logs,
  news,
  orders,
  users,
  webhooks,
} from './controller'
import {
  authAdminMiddleware,
  authMiddleware,
  payloadLimiter,
} from './middleware'
import { formatUptime, ngrokForward } from './utils'

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

app.use(logger())
app.use(limiter)
app.use(trimTrailingSlash())
app.use('*', corsMiddleware)
app.use('*', payloadLimiter)
app.use('*', timeout(10000))
app.use('/favicon.ico', serveStatic({ path: './static/favicon.ico' }))

if (Bun.env.NODE_ENV === 'prod') {
  const csrfMiddleware: MiddlewareHandler = csrf({
    origin: [env.clientBaseUrl!],
  })

  app.use('*', async (c: Context<Env, string, object>, next: Next) => {
    if (c.req.path === '/webhooks/stripe') {
      return next()
    }

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

app.route('/api', api)
app.route('/webhooks', webhooks)

api.route('/books', books)
api.route('/authors', authors)
api.route('/news', news)
api.route('/search_opts', bookSearchOptions)
api.route('/users', users)
api.route('/orders', orders)
api.route('/cms', cms)
api.route('/logs', logs)
api.use('/users/profile', authMiddleware)
api.use('/users/logout', authMiddleware)
api.use('/users/avatar', authMiddleware)
api.use('/cms/*', authAdminMiddleware)

if (env.ngrokAuthToken) void ngrokForward()

export default app
