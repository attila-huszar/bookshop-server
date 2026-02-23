import { Hono } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { env, PAYMENT_SESSION, paymentCookieOptions } from '@/config'
import {
  cancelPaymentIntent,
  createPaymentIntent,
  retrievePaymentIntent,
} from '@/services'
import { usersDB } from '@/repositories'
import { stripSensitiveUserFields } from '@/utils'
import { errorHandler } from '@/errors'
import type { PaymentIntentRequest, PublicUser } from '@/types'

type Variables = {
  jwtPayload?: {
    uuid: string
  }
}

export const payments = new Hono<{ Variables: Variables }>()

payments.get('/:paymentId', async (c) => {
  try {
    const paymentId = c.req.param('paymentId')
    const paymentSessionCookie = await getSignedCookie(
      c,
      env.cookieSecret!,
      PAYMENT_SESSION,
    )

    if (paymentSessionCookie === false) {
      deleteCookie(c, PAYMENT_SESSION, paymentCookieOptions)
    }

    const paymentSessionId =
      typeof paymentSessionCookie === 'string'
        ? paymentSessionCookie
        : undefined

    const jwtPayload = c.get('jwtPayload')

    let userEmail: string | undefined

    if (jwtPayload?.uuid) {
      const user = await usersDB.getUserBy('uuid', jwtPayload.uuid)
      userEmail = user?.email
    }

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

    if (jwtPayload) {
      const user = await usersDB.getUserBy('uuid', jwtPayload.uuid)
      publicUser = user && stripSensitiveUserFields(user)
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
    const paymentSessionCookie = await getSignedCookie(
      c,
      env.cookieSecret!,
      PAYMENT_SESSION,
    )

    if (paymentSessionCookie === false) {
      deleteCookie(c, PAYMENT_SESSION, paymentCookieOptions)
    }

    const paymentSessionId =
      typeof paymentSessionCookie === 'string'
        ? paymentSessionCookie
        : undefined

    const jwtPayload = c.get('jwtPayload')

    let userEmail: string | undefined

    if (jwtPayload?.uuid) {
      const user = await usersDB.getUserBy('uuid', jwtPayload.uuid)
      userEmail = user?.email
    }

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
