import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { deleteCookie, setSignedCookie } from 'hono/cookie'
import { env, PAYMENT_SESSION, paymentCookieOptions } from '@/config'
import {
  acceptPaymentTerms,
  cancelPaymentIntent,
  getPaymentTerms,
  retrievePaymentIntent,
  startCheckoutPayment,
} from '@/services'
import { publicUserResponse } from '@/utils/response.utils'
import { getPaymentIdempotencyKey } from '@/utils/stripe.utils'
import { API } from '@/constants'
import type { PaymentIntentRequest, PaymentVariables } from '@/types'

export const payments = new Hono<{ Variables: PaymentVariables }>()

payments.get(API.payments.terms, async (c) => {
  c.header('Cache-Control', 'no-store')
  const review = await getPaymentTerms(
    c.req.param('paymentId'),
    c.get('paymentAccess') ?? {},
  )

  return c.json(review)
})

payments.post(API.payments.terms, async (c) => {
  const acceptance = await acceptPaymentTerms(
    c.req.param('paymentId'),
    await c.req.json<unknown>(),
    c.get('paymentAccess') ?? {},
  )

  return c.json(acceptance)
})

payments.get(API.payments.byId, async (c) => {
  const paymentId = c.req.param('paymentId')
  const { cookiePaymentId, userEmail } = c.get('paymentAccess') ?? {}

  const paymentIntent = await retrievePaymentIntent(paymentId, {
    userEmail,
    cookiePaymentId,
  })

  return c.json(paymentIntent)
})

payments.post(API.payments.root, async (c) => {
  const paymentIntentRequest = await c.req.json<PaymentIntentRequest>()
  const suppliedIdempotencyKey = c.req.header('Idempotency-Key')?.trim()
  const clientIdempotencyKey =
    suppliedIdempotencyKey !== undefined && suppliedIdempotencyKey.length > 0
      ? suppliedIdempotencyKey
      : randomUUID()

  const authUser = c.get('authUser')
  const publicUser = authUser ? publicUserResponse(authUser) : null

  const checkoutRequestId = getPaymentIdempotencyKey(
    clientIdempotencyKey,
    paymentIntentRequest,
    publicUser,
  )

  const { paymentId, paymentToken, amount } = await startCheckoutPayment(
    paymentIntentRequest,
    publicUser,
    checkoutRequestId,
  )

  await setSignedCookie(
    c,
    PAYMENT_SESSION,
    paymentId,
    env.cookieSecret!,
    paymentCookieOptions,
  )

  return c.json({ paymentId, paymentToken, amount })
})

payments.delete(API.payments.byId, async (c) => {
  const paymentId = c.req.param('paymentId')
  const { cookiePaymentId, userEmail } = c.get('paymentAccess') ?? {}

  const paymentIntent = await cancelPaymentIntent(paymentId, {
    userEmail,
    cookiePaymentId,
  })

  deleteCookie(c, PAYMENT_SESSION, paymentCookieOptions)

  return c.json(paymentIntent)
})
