import { ordersDB } from '@/repositories'
import { throwCriticalOrderPersistFailure } from '@/utils'
import { stripe } from '@/libs'
import { IssueCode, type StripePaymentIntent } from '@/types'
import {
  assertCancelablePaymentStatus,
  type PaymentAccess,
  resolveAuthorizedPayment,
  toOrderPersistSnapshot,
} from './shared'

export async function cancelPaymentIntent(
  paymentId: string,
  access?: PaymentAccess,
): Promise<StripePaymentIntent> {
  const { validatedId, order } = await resolveAuthorizedPayment({
    paymentId,
    access,
  })
  assertCancelablePaymentStatus(order.paymentStatus)

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
