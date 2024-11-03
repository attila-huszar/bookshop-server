import ngrok from '@ngrok/ngrok'
import { Hono } from 'hono'
import { db } from './db/sqlite'
import { usersTable } from './db/schema'

const app = new Hono()

app.get('/', async (c) => {
  const users = await db.select().from(usersTable)

  return c.text(`Hello ${users[0].name}!`)
})

export default {
  port: Bun.env.PORT || 5000,
  fetch: app.fetch,
}

async function ngrokServe() {
  const listener = await ngrok.forward({
    addr: Bun.env.PORT || 5000,
    authtoken: Bun.env.NGROK_AUTHTOKEN,
    domain: Bun.env.NGROK_DOMAIN,
  })

  console.log(`Ingress established at: ${listener.url()}`)
}

ngrokServe()
