import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
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
  limit: 500,
  message: { error: 'Too many requests' },
  statusCode: 429,
  standardHeaders: 'draft-6',
  keyGenerator: (c) =>
    c.req.header('x-real-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0] ??
    'unknown-client',
})

app.use(limiter)
app.use(logger())
app.use(trimTrailingSlash())
app.use(csrf({ origin: [env.clientBaseUrl] }))
app.use('*', cors())
app.use('*', timeout(10000))
app.use('/favicon.ico', serveStatic({ path: './static/favicon.ico' }))

app.use('/users/profile', authMiddleware)
app.use('/users/logout', authMiddleware)
app.use('/orders/*', authMiddleware)

app.get('/', (c) => {
  return c.html(
    `<h2>Book Shop Backend</h2><p>Uptime: ${formatUptime(Bun.nanoseconds())}</p>`,
  )
})

app.route('/books', controller.books)
app.route('/authors', controller.authors)
app.route('/news', controller.news)
app.route('/search_opts', controller.bookSearchOptions)
app.route('/users', controller.users)
app.route('/orders', controller.orders)

if (env.ngrokAuthToken) void ngrokForward()

export default app
