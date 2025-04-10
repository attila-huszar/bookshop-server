import './config/validateEnv'
import { env } from './config/env'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { csrf } from 'hono/csrf'
import { timeout } from 'hono/timeout'
import { trimTrailingSlash } from 'hono/trailing-slash'
import { serveStatic } from 'hono/bun'
import { rateLimiter } from 'hono-rate-limiter'
import { payloadLimiter, authMiddleware } from './middleware'
import { formatUptime, ngrokForward } from './utils'
import * as controller from './controller'

const app = new Hono()

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
app.use(csrf({ origin: [env.clientBaseUrl!] }))
app.use('/favicon.ico', serveStatic({ path: './static/favicon.ico' }))

app.get('/', (c) => {
  return c.html(
    `<h2>Bookshop Backend</h2>
    <p>Uptime: ${formatUptime(Bun.nanoseconds())}</p>
    <p>Your IP: ${c.req.header('X-Forwarded-For') ?? c.req.header('X-Real-Ip') ?? 'unknown'}</p>`,
  )
})

app.use('/users/profile', authMiddleware)
app.use('/users/logout', authMiddleware)
app.use('/upload', authMiddleware)

app.route('/books', controller.books)
app.route('/authors', controller.authors)
app.route('/news', controller.news)
app.route('/search_opts', controller.bookSearchOptions)
app.route('/users', controller.users)
app.route('/orders', controller.orders)
app.route('/upload', controller.upload)

if (env.ngrokAuthToken) void ngrokForward()

export default app
