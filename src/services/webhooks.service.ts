import { Stripe } from 'stripe'
import { env } from '@/config'
import { ordersDB } from '@/repositories'
import { extractPaymentIntentFields, getPaymentIntentId } from '@/utils'
import { log } from '@/libs'
import { emailQueue } from '@/queues'
import { jobOpts, QUEUE } from '@/constants'
import { BadRequest, Internal } from '@/errors'
import {
  isChargeEvent,
  isDisputeEvent,
  isPaymentIntentEvent,
  isRefundEvent,
  type OrderConfirmationEmailProps,
  type OrderUpdate,
  type StripeEvent,
} from '@/types'

const stripe = new Stripe(env.stripeSecret!)

export async function processStripeWebhook(
  payload: string,
  signature: string,
): Promise<{ received: boolean }> {
  if (!env.stripeWebhookSecret) {
    throw new Internal('Stripe webhook secret not configured')
  }

  let event: StripeEvent

  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      env.stripeWebhookSecret,
    )
  } catch (err) {
    throw new BadRequest(
      `Webhook signature verification failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    )
  }

  if (isPaymentIntentEvent(event)) {
    const { data, type } = event
    const paymentIntent = data.object

    switch (type) {
      case 'payment_intent.created': {
        await updateOrderFromWebhook(
          paymentIntent.id,
          {
            paymentStatus: paymentIntent.status,
          },
          type,
        )
        break
      }
      case 'payment_intent.succeeded': {
        const result = await updateOrderFromWebhook(
          paymentIntent.id,
          {
            ...extractPaymentIntentFields(paymentIntent),
            paymentStatus: paymentIntent.status,
          },
          type,
        )

        if (!result) {
          throw new Internal(
            `Order not found for successful payment: ${paymentIntent.id}`,
          )
        }

        const { justPaid, ...updatedOrder } = result

        if (!updatedOrder.email || !updatedOrder.firstName) {
          void log.error(
            'Order missing email or first name for confirmation email',
            { paymentId: paymentIntent.id },
          )
        } else if (justPaid) {
          const jobData: OrderConfirmationEmailProps = {
            type: QUEUE.EMAIL.JOB.ORDER_CONFIRMATION,
            toAddress: updatedOrder.email,
            toName: updatedOrder.firstName,
            order: updatedOrder,
          }

          void emailQueue
            .add(QUEUE.EMAIL.JOB.ORDER_CONFIRMATION, jobData, jobOpts)
            .catch((error: Error) => {
              void log.error(
                '[QUEUE] Order confirmation email queueing failed',
                { error, paymentId: paymentIntent.id },
              )
            })
        }

        void log.info('[STRIPE] Payment succeeded via webhook', {
          paymentId: paymentIntent.id,
        })
        break
      }
      case 'payment_intent.amount_capturable_updated': {
        await updateOrderFromWebhook(
          paymentIntent.id,
          {
            ...extractPaymentIntentFields(paymentIntent),
            paymentStatus: paymentIntent.status,
          },
          type,
        )

        void log.info('[STRIPE] Payment capturable via webhook', {
          paymentId: paymentIntent.id,
        })
        break
      }
      case 'payment_intent.partially_funded': {
        await updateOrderFromWebhook(
          paymentIntent.id,
          {
            paymentStatus: paymentIntent.status,
          },
          type,
        )
        break
      }
      case 'payment_intent.payment_failed': {
        await updateOrderFromWebhook(
          paymentIntent.id,
          {
            paymentStatus: paymentIntent.status,
          },
          type,
        )

        void log.warn('[STRIPE] Payment failed via webhook', {
          paymentId: paymentIntent.id,
          error: paymentIntent.last_payment_error?.message,
        })
        break
      }
      case 'payment_intent.requires_action': {
        await updateOrderFromWebhook(
          paymentIntent.id,
          {
            paymentStatus: paymentIntent.status,
          },
          type,
        )
        break
      }
      case 'payment_intent.processing': {
        await updateOrderFromWebhook(
          paymentIntent.id,
          {
            paymentStatus: paymentIntent.status,
          },
          type,
        )
        break
      }
      case 'payment_intent.canceled': {
        const result = await updateOrderFromWebhook(
          paymentIntent.id,
          {
            ...extractPaymentIntentFields(paymentIntent),
            paymentStatus: 'canceled',
          },
          type,
        )

        if (!result) {
          throw new Internal(
            `Order not found for canceled payment: ${paymentIntent.id}`,
          )
        }

        void log.info('[STRIPE] Payment canceled via webhook', {
          paymentId: paymentIntent.id,
        })
        break
      }
    }
  } else if (isChargeEvent(event)) {
    const { data, type } = event
    const charge = data.object

    const paymentIntentId = getPaymentIntentId(charge)

    if (!paymentIntentId) {
      void log.info('[STRIPE] Charge event without payment intent reference', {
        chargeId: charge.id,
        eventType: event.type,
      })
      return { received: true }
    }

    switch (type) {
      case 'charge.succeeded':
        void log.info('[STRIPE] Charge succeeded via webhook', {
          paymentId: paymentIntentId,
          chargeId: charge.id,
        })
        break
      case 'charge.updated':
        void log.info('[STRIPE] Charge updated via webhook', {
          paymentId: paymentIntentId,
          chargeId: charge.id,
        })
        break
      case 'charge.refunded':
        void log.info('[STRIPE] Charge refunded via webhook', {
          paymentId: paymentIntentId,
          chargeId: charge.id,
          refundedAmount: charge.amount_refunded,
        })
        break
    }
  } else if (isRefundEvent(event)) {
    const { data } = event
    const refund = data.object

    const paymentIntentId = getPaymentIntentId(refund)

    if (!paymentIntentId) {
      void log.info('[STRIPE] Refund without payment intent reference', {
        refundId: refund.id,
        eventType: event.type,
      })
      return { received: true }
    }

    void log.info('[STRIPE] Refund updated via webhook', {
      paymentId: paymentIntentId,
      refundId: refund.id,
      refundedAmount: refund.amount,
    })
  } else if (isDisputeEvent(event)) {
    const { data, type } = event
    const dispute = data.object

    const paymentIntentId = getPaymentIntentId(dispute)

    if (!paymentIntentId) {
      void log.info('[STRIPE] Dispute without payment intent reference', {
        disputeId: dispute.id,
        eventType: event.type,
      })
      return { received: true }
    }

    switch (type) {
      case 'charge.dispute.created':
        void log.info('[STRIPE] Dispute created via webhook', {
          paymentId: paymentIntentId,
          disputeId: dispute.id,
          status: dispute.status,
        })
        break
      case 'charge.dispute.closed':
        void log.info('[STRIPE] Dispute closed via webhook', {
          paymentId: paymentIntentId,
          disputeId: dispute.id,
          status: dispute.status,
        })
        break
    }
  } else {
    void log.info(`[STRIPE] Unhandled webhook event type: ${event.type}`)
  }

  return { received: true }
}

export async function updateOrderFromWebhook(
  paymentIntentId: string,
  data: OrderUpdate,
  eventType: string,
) {
  const existingOrder = await ordersDB.getOrder(paymentIntentId)

  if (!existingOrder) {
    void log.warn('Failed to find order for payment intent', {
      paymentId: paymentIntentId,
      eventType,
    })
    return null
  }

  const updateData: OrderUpdate = { ...data }
  const justPaid = data.paymentStatus === 'succeeded' && !existingOrder.paidAt

  if (justPaid) {
    updateData.paidAt = new Date()
  }

  const updatedOrder = await ordersDB.updateOrder(paymentIntentId, updateData)
  return updatedOrder ? { ...updatedOrder, justPaid } : null
}
