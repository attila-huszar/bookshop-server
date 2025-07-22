import { Stripe } from 'stripe'
import { env } from '@/config'
import { ordersDB } from '@/repositories'
import { validate, orderCreateSchema, orderUpdateSchema } from '@/validation'
import { log } from '@/libs'
import { emailQueue } from '@/queues'
import { jobOpts, QUEUE } from '@/constants'
import { Internal } from '@/errors'
import type {
  Order,
  OrderUpdate,
  PaymentIntentCreate,
  SendEmailProps,
} from '@/types'

const stripe = new Stripe(env.stripeSecret!)

export async function createPaymentIntent(createRequest: PaymentIntentCreate) {
  return stripe.paymentIntents.create(createRequest)
}

export async function retrievePaymentIntent(paymentId: string) {
  return stripe.paymentIntents.retrieve(paymentId)
}

export async function cancelPaymentIntent(paymentId: string) {
  return stripe.paymentIntents.cancel(paymentId)
}

export async function createOrder(orderRequest: Order) {
  orderRequest.firstName ??= null
  orderRequest.lastName ??= null
  orderRequest.email ??= null
  orderRequest.address ??= null

  const validatedOrder = validate(orderCreateSchema, orderRequest)

  const createdOrder = await ordersDB.createOrder(validatedOrder)

  if (!createdOrder) {
    throw new Internal('Failed to create order')
  }

  return { paymentId: createdOrder.paymentId }
}

export async function updateOrder(orderUpdateRequest: OrderUpdate) {
  const { paymentId, fields } = validate(orderUpdateSchema, orderUpdateRequest)

  const updatedOrder = await ordersDB.updateOrder(paymentId, {
    ...fields,
    updatedAt: new Date().toISOString(),
  })

  if (!updatedOrder?.email || !updatedOrder.firstName) {
    throw new Internal('Failed to update order')
  }

  void emailQueue
    .add(
      QUEUE.EMAIL.JOB.ORDER_CONFIRMATION,
      {
        type: QUEUE.EMAIL.JOB.ORDER_CONFIRMATION,
        toAddress: updatedOrder.email,
        toName: updatedOrder.firstName,
        order: updatedOrder,
      } satisfies SendEmailProps,
      jobOpts,
    )
    .catch((error: Error) => {
      void log.error('[QUEUE] Order confirmation email queueing failed', {
        error,
      })
    })

  return updatedOrder
}
