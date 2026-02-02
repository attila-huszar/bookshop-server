import { Stripe } from 'stripe'
import { env } from '@/config'
import { ordersDB } from '@/repositories'
import {
  extractChargeFields,
  extractPaymentIntentFields,
  getPaymentIntentIdFromCharge,
  getPaymentIntentIdFromRefund,
} from '@/utils'
import { log } from '@/libs'
import { emailQueue } from '@/queues'
import { jobOpts, QUEUE } from '@/constants'
import { BadRequest, Internal } from '@/errors'
import {
  isChargeEvent,
  isDisputeEvent,
  isPaymentIntentEvent,
  isRefundEvent,
  type OrderUpdate,
  type SendEmailProps,
} from '@/types'

const stripe = new Stripe(env.stripeSecret!)

async function updateOrderIfExists(
  paymentIntentId: string,
  data: OrderUpdate,
  eventType: string,
) {
  const existingOrder = await ordersDB.getOrderByPaymentId(paymentIntentId)

  if (!existingOrder) {
    void log.warn('Webhook received for missing order', {
      paymentId: paymentIntentId,
      eventType,
    })
    return null
  }

  return ordersDB.updateOrder(paymentIntentId, data)
}

export async function processStripeWebhook(
  payload: string,
  signature: string,
): Promise<{ received: boolean }> {
  if (!env.stripeWebhookSecret) {
    throw new Internal('Stripe webhook secret not configured')
  }

  let event: Stripe.Event

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
        await updateOrderIfExists(
          paymentIntent.id,
          {
            paymentStatus: paymentIntent.status,
          },
          type,
        )
        break
      }
      case 'payment_intent.succeeded': {
        const existingOrder = await ordersDB.getOrderByPaymentId(
          paymentIntent.id,
        )

        if (!existingOrder) {
          void log.warn('Webhook received for missing order', {
            paymentId: paymentIntent.id,
            eventType: type,
          })
          break
        }

        const wasAlreadyPaid = existingOrder.paymentStatus === 'succeeded'

        const updatedOrder = await ordersDB.updateOrder(paymentIntent.id, {
          ...extractPaymentIntentFields(paymentIntent),
          paymentStatus: paymentIntent.status,
        })

        if (!wasAlreadyPaid && updatedOrder?.email && updatedOrder.firstName) {
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
              void log.error(
                '[QUEUE] Order confirmation email queueing failed',
                {
                  error,
                  paymentId: paymentIntent.id,
                },
              )
            })
        }

        void log.info('Payment succeeded via webhook', {
          paymentId: paymentIntent.id,
          wasAlreadyPaid,
        })
        break
      }
      case 'payment_intent.amount_capturable_updated': {
        await updateOrderIfExists(
          paymentIntent.id,
          {
            ...extractPaymentIntentFields(paymentIntent),
            paymentStatus: paymentIntent.status,
          },
          type,
        )

        void log.info('Payment capturable via webhook', {
          paymentId: paymentIntent.id,
        })
        break
      }
      case 'payment_intent.partially_funded': {
        await updateOrderIfExists(
          paymentIntent.id,
          {
            paymentStatus: paymentIntent.status,
          },
          type,
        )
        break
      }
      case 'payment_intent.payment_failed': {
        await updateOrderIfExists(
          paymentIntent.id,
          {
            paymentStatus: paymentIntent.status,
          },
          type,
        )

        void log.warn('Payment failed via webhook', {
          paymentId: paymentIntent.id,
          error: paymentIntent.last_payment_error?.message,
        })
        break
      }
      case 'payment_intent.requires_action': {
        await updateOrderIfExists(
          paymentIntent.id,
          {
            paymentStatus: paymentIntent.status,
          },
          type,
        )
        break
      }
      case 'payment_intent.processing': {
        await updateOrderIfExists(
          paymentIntent.id,
          {
            paymentStatus: paymentIntent.status,
          },
          type,
        )
        break
      }
      case 'payment_intent.canceled': {
        await updateOrderIfExists(
          paymentIntent.id,
          {
            ...extractPaymentIntentFields(paymentIntent),
            paymentStatus: 'canceled',
          },
          type,
        )

        void log.info('Payment canceled via webhook', {
          paymentId: paymentIntent.id,
        })
        break
      }
    }
  } else if (isChargeEvent(event)) {
    const { data, type } = event
    const charge = data.object

    const paymentIntentId = getPaymentIntentIdFromCharge(charge)

    if (!paymentIntentId) {
      void log.warn('Charge event without payment intent reference', {
        chargeId: charge.id,
        eventType: event.type,
      })
      return { received: true }
    }

    if (type === 'charge.succeeded') {
      await updateOrderIfExists(
        paymentIntentId,
        {
          ...extractChargeFields(charge),
        },
        type,
      )

      void log.info('Charge succeeded via webhook', {
        paymentId: paymentIntentId,
      })
    } else if (type === 'charge.updated') {
      await updateOrderIfExists(
        paymentIntentId,
        {
          ...extractChargeFields(charge),
        },
        type,
      )
    } else if (type === 'charge.refunded') {
      void log.info('Charge refund via webhook', {
        paymentId: paymentIntentId,
        refundedAmount: charge.amount_refunded,
      })
    }
  } else if (isRefundEvent(event)) {
    const refund = event.data.object

    const paymentIntentId = getPaymentIntentIdFromRefund(refund)

    if (!paymentIntentId) {
      void log.warn('Charge refund without payment intent reference', {
        refundId: refund.id,
        eventType: event.type,
      })
      return { received: true }
    }

    void log.info('Charge refund via webhook', {
      paymentId: paymentIntentId,
      refundedAmount: refund.amount,
    })
  } else if (isDisputeEvent(event)) {
    const { data, type } = event
    const dispute = data.object

    const paymentIntentId =
      typeof dispute.payment_intent === 'string'
        ? dispute.payment_intent
        : dispute.payment_intent?.id

    if (!paymentIntentId) {
      void log.warn('Dispute without payment intent reference', {
        disputeId: dispute.id,
        eventType: event.type,
      })
      return { received: true }
    }

    if (type === 'charge.dispute.created') {
      void log.info('Dispute created via webhook', {
        paymentId: paymentIntentId,
        disputeId: dispute.id,
        status: dispute.status,
      })
    } else if (type === 'charge.dispute.closed') {
      void log.info('Dispute closed via webhook', {
        paymentId: paymentIntentId,
        disputeId: dispute.id,
        status: dispute.status,
      })
    }
  } else {
    void log.info(`Unhandled webhook event type: ${event.type}`)
  }

  return { received: true }
}
