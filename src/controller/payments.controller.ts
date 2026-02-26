import { Hono } from 'hono'
import { deleteCookie, setSignedCookie } from 'hono/cookie'
import { env, PAYMENT_SESSION, paymentCookieOptions } from '@/config'
import {
  cancelPaymentIntent,
  createPaymentIntent,
  getUserProfile,
  retrieveOrderSyncStatus,
  retrievePaymentIntent,
} from '@/services'
import { retryableStatuses } from '@/constants'
import { errorHandler } from '@/errors'
import type { PaymentIntentRequest, PublicUser } from '@/types'

type Variables = {
  jwtPayload?: {
    uuid: string
  }
  paymentAccess?: {
    paymentSessionId?: string
    userEmail?: string
  }
}

export const payments = new Hono<{ Variables: Variables }>()

payments.get('/:paymentId/order-sync', async (c) => {
  try {
    const paymentId = c.req.param('paymentId')
    const { paymentSessionId, userEmail } = c.get('paymentAccess') ?? {}

    const orderSyncStatus = await retrieveOrderSyncStatus(paymentId, {
      userEmail,
      paymentSessionId,
    })

    if (retryableStatuses.includes(orderSyncStatus.paymentStatus)) {
      return c.json(orderSyncStatus, 202)
    }

    return c.json(orderSyncStatus)
  } catch (error) {
    return errorHandler(c, error)
  }
})

payments.get('/:paymentId', async (c) => {
  try {
    const paymentId = c.req.param('paymentId')
    const { paymentSessionId, userEmail } = c.get('paymentAccess') ?? {}

    const paymentIntent = await retrievePaymentIntent(paymentId, {
      userEmail,
      paymentSessionId,
    })

    return c.json(paymentIntent)
  } catch (error) {
    return errorHandler(c, error)
  }
})

payments.post('/', async (c) => {
  try {
    const paymentIntentRequest = await c.req.json<PaymentIntentRequest>()

    const jwtPayload = c.get('jwtPayload')
    let publicUser: PublicUser | null = null

    if (jwtPayload?.uuid) {
      publicUser = await getUserProfile(jwtPayload.uuid, { optional: true })
    }

    const { paymentId, paymentToken, amount } = await createPaymentIntent(
      paymentIntentRequest,
      publicUser,
    )

    await setSignedCookie(
      c,
      PAYMENT_SESSION,
      paymentId,
      env.cookieSecret!,
      paymentCookieOptions,
    )

    return c.json({ paymentId, paymentToken, amount })
  } catch (error) {
    return errorHandler(c, error)
  }
})

payments.delete('/:paymentId', async (c) => {
  try {
    const paymentId = c.req.param('paymentId')
    const { paymentSessionId, userEmail } = c.get('paymentAccess') ?? {}

    const paymentIntent = await cancelPaymentIntent(paymentId, {
      userEmail,
      paymentSessionId,
    })

    deleteCookie(c, PAYMENT_SESSION, paymentCookieOptions)

    return c.json(paymentIntent)
  } catch (error) {
    return errorHandler(c, error)
  }
})
