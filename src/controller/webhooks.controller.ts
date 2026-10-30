import { Hono } from 'hono'
import { verifyAndHandleStripeWebhook } from '@/services'
import { API } from '@/constants'
import { HttpErrorCode } from '@/types/enums'

export const webhooks = new Hono()

webhooks.post(API.webhooks.stripe, async (c) => {
  const signature = c.req.header('stripe-signature')

  if (!signature) {
    return c.json({ code: HttpErrorCode.BadRequest }, 400)
  }

  const payload = await c.req.text()
  const result = await verifyAndHandleStripeWebhook(payload, signature)

  return c.json(result)
})
