import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { csrf } from 'hono/csrf'
import { timeout } from 'hono/timeout'
import { trimTrailingSlash } from 'hono/trailing-slash'
import { rateLimiter } from 'hono-rate-limiter'
import { formatUptime, ngrokForward } from './utils'
import { env } from './config'
import { authMiddleware } from './middleware'
import * as controller from './controller'

const app = new Hono()

const allowedOrigins =
  process.env.NODE_ENV === 'production'
    ? ['']
    : [env.clientBaseUrl, 'http://localhost']

const corsOptions = {
  origin: '*',
  exposeHeaders: ['x-total-count'],
  credentials: true,
}

const limiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 100,
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
app.use(csrf({ origin: allowedOrigins }))
app.use('/*', cors(corsOptions))
app.use('/*', timeout(5000))

app.use('/users/profile', authMiddleware)
app.use('/users/logout', authMiddleware)

app.get('/', (c) => {
  return c.html(
    `<h2>Book Shop Backend</h2><p>Uptime: ${formatUptime(Bun.nanoseconds())}</p}`,
  )
})

app.route('/books', controller.books)
app.route('/authors', controller.authors)
app.route('/search_opts', controller.bookSearchOptions)
app.route('/users', controller.users)
app.route('/auth', controller.auth)

if (env.ngrokAuthToken) void ngrokForward()

export default app
