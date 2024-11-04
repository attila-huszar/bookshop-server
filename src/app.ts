import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { ngrokForward } from './ngrok'
import * as controller from './controller'

const app = new Hono()

app.use(logger())
app.use('/api/*', cors())

app.get('/', (c) => {
  return c.text('Book Shop Backend')
})

Object.values(controller).forEach((ctrl) => app.route('/api', ctrl))

export default app

if (!!Bun.env.NGROK_AUTHTOKEN) ngrokForward()
