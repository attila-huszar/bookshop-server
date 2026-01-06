import { Hono } from 'hono'
import { processStripeWebhook } from '@/services'
import { errorHandler } from '@/errors'

export const webhooks = new Hono()

webhooks.post('/stripe', async (c) => {
  try {
    const signature = c.req.header('stripe-signature')

    if (!signature) {
      return c.json({ error: 'Missing stripe-signature header' }, 400)
    }

    const payload = await c.req.text()
    const result = await processStripeWebhook(payload, signature)

    return c.json(result)
  } catch (error) {
    return errorHandler(c, error)
  }
})
