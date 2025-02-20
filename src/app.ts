import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { getConnInfo } from 'hono/bun'
import { csrf } from 'hono/csrf'
import { timeout } from 'hono/timeout'
import { trimTrailingSlash } from 'hono/trailing-slash'
import { serveStatic } from 'hono/bun'
import { rateLimiter } from 'hono-rate-limiter'
import { formatUptime, ngrokForward } from './utils'
import { env } from './config'
import { authMiddleware } from './middleware'
import * as controller from './controller'
import * as Sentry from '@sentry/bun'

Sentry.init({
  dsn: env.sentryDsn,
  tracesSampleRate: 1.0,
})

const app = new Hono()

const limiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  message: { error: 'Too many requests' },
  statusCode: 429,
  standardHeaders: 'draft-6',
  keyGenerator: (c) => {
    const info = getConnInfo(c)
    return (
      info.remote.address ??
      c.req.header('x-real-ip') ??
      c.req.header('x-forwarded-for')?.split(',')[0] ??
      'unknown-client'
    )
  },
})

const corsMiddleware = cors({
  origin: env.clientBaseUrl,
  allowHeaders: ['authorization', 'content-type', 'ngrok-skip-browser-warning'],
  allowMethods: ['GET', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
})

app.use(limiter)
app.use(logger())
app.use(trimTrailingSlash())
app.use('*', corsMiddleware)
app.use(csrf({ origin: [env.clientBaseUrl] }))
app.use('*', timeout(10000))
app.use('/favicon.ico', serveStatic({ path: './static/favicon.ico' }))

app.get('/', (c) => {
  return c.html(
    `<h2>Book Shop Backend</h2><p>Uptime: ${formatUptime(Bun.nanoseconds())}</p>`,
  )
})

app.use('/users/profile', authMiddleware)
app.use('/users/logout', authMiddleware)

app.route('/books', controller.books)
app.route('/authors', controller.authors)
app.route('/news', controller.news)
app.route('/search_opts', controller.bookSearchOptions)
app.route('/users', controller.users)
app.route('/orders', controller.orders)

if (env.ngrokAuthToken) void ngrokForward()

export default app
