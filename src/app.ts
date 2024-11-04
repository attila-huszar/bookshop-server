import { Hono } from 'hono'
import { db } from './db'
import { usersTable } from './db/schema'
import { ngrokForward } from './ngrok'

const app = new Hono()

app.get('/', async (c) => {
  const users = await db.select().from(usersTable)

  return c.text(`Hello ${users[0].name}!`)
})

export default {
  port: Bun.env.PORT || 5000,
  fetch: app.fetch,
}

if (!!Bun.env.NGROK_AUTHTOKEN) ngrokForward()
