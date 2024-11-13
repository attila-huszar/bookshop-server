import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { timeout } from 'hono/timeout'
import { formatUptime, ngrokForward } from './utils'
import * as controller from './controller'

const app = new Hono()

const corsOptions = {
  origin: '*',
  exposeHeaders: ['x-total-count'],
  credentials: true,
}

app.use(logger())
app.use('/api', cors(corsOptions))
app.use('/api', timeout(5000))

app.get('/', (c) => {
  return c.html(
    `<h2>Book Shop Backend</h2><p>Uptime: ${formatUptime(Bun.nanoseconds())}</p}`,
  )
})

Object.values(controller).forEach((ctrl) => app.route('/api', ctrl))

if (!!Bun.env.NGROK_AUTHTOKEN) ngrokForward()

export default app
