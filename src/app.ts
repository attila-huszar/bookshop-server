import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { timeout } from 'hono/timeout'
import { formatUptime, ngrokForward } from './utils'
import { ngrokAuthToken } from './config/envConfig'
import { authMiddleware } from './middleware'
import * as controller from './controller'

const app = new Hono()

const corsOptions = {
  origin: '*',
  exposeHeaders: ['x-total-count'],
  credentials: true,
}

app.use(logger())
app.use('/*', cors(corsOptions))
app.use('/*', timeout(5000))
app.use('/auth/*', authMiddleware)

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

if (ngrokAuthToken) void ngrokForward()

export default app
