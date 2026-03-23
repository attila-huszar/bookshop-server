import { ordersDB } from '@/repositories'
import { paymentIdSchema, validate } from '@/validation'
import { throwCriticalOrderPersistFailure } from '@/utils'
import { BadRequest } from '@/errors'
import { IssueCode } from '@/types'
import {
  authorizePaymentAccess,
  type PaymentAccess,
  stripe,
  toOrderPersistSnapshot,
} from './shared'

export async function cancelPaymentIntent(
  paymentId: string,
  access?: PaymentAccess,
) {
  const validatedId = validate(paymentIdSchema, paymentId)
  const order = await authorizePaymentAccess(validatedId, access)

  if (order.paymentStatus === 'canceled') {
    throw new BadRequest('Payment already canceled')
  }

  if (order.paymentStatus === 'succeeded') {
    throw new BadRequest('Cannot cancel succeeded payment')
  }

  const cancelledIntent = await stripe.paymentIntents.cancel(validatedId)

  try {
    await ordersDB.updateOrder(validatedId, {
      paymentStatus: 'canceled',
    })
  } catch (error) {
    throwCriticalOrderPersistFailure({
      issueCode: IssueCode.PAYMENT_CANCEL_PERSIST_FAILED,
      message:
        '[CRITICAL] Stripe payment canceled but order status update failed',
      throwMessage: 'Failed to persist canceled payment status',
      operation: 'update',
      paymentId: validatedId,
      persistFailureReason: 'threw',
      persistError: error,
      dbStatus: order.paymentStatus,
      stripeStatus: 'canceled',
      order: toOrderPersistSnapshot(order),
    })
  }

  return cancelledIntent
}
