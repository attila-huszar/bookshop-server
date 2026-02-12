import { Hono } from 'hono'
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
    const paymentIntent = await retrievePaymentIntent(paymentId)

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

    const { session, amount } = await createPaymentIntent(
      paymentIntentRequest,
      publicUser,
    )

    return c.json({ session, amount })
  } catch (error) {
    return errorHandler(c, error)
  }
})

payments.delete('/:paymentId', async (c) => {
  try {
    const paymentId = c.req.param('paymentId')
    const paymentIntent = await cancelPaymentIntent(paymentId)

    return c.json(paymentIntent)
  } catch (error) {
    return errorHandler(c, error)
  }
})
