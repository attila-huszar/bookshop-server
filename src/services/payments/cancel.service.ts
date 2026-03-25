import { ordersDB } from '@/repositories'
import { stripe } from '@/libs'
import { paymentMessage } from '@/constants'
import { BadRequest, Internal } from '@/errors'
import { IssueCode, type StripePaymentIntent } from '@/types'
import {
  type PaymentAccess,
  reportOrderSaveError,
  resolveAuthorizedPayment,
} from '../shared'

export async function cancelPaymentIntent(
  paymentId: string,
  access?: PaymentAccess,
): Promise<StripePaymentIntent> {
  const { validatedId, order } = await resolveAuthorizedPayment(
    paymentId,
    access,
  )
  if (order.paymentStatus === 'canceled') {
    throw new BadRequest(paymentMessage.paymentAlreadyCanceled)
  }

  if (order.paymentStatus === 'succeeded') {
    throw new BadRequest(paymentMessage.paymentCannotCancelSucceeded)
  }

  const cancelledIntent = await stripe.paymentIntents.cancel(validatedId)

  try {
    await ordersDB.updateOrder(validatedId, {
      paymentStatus: 'canceled',
    })
  } catch (error) {
    reportOrderSaveError({
      issueCode: IssueCode.PAYMENT_CANCEL_SAVE_FAILED,
      message: '[CRITICAL] Stripe payment canceled but order save failed',
      operation: 'update',
      paymentId: validatedId,
      saveFailureReason: 'threw',
      saveError: error,
      dbStatus: order.paymentStatus,
      stripeStatus: 'canceled',
      order,
    })
    throw new Internal('Failed to save canceled payment status')
  }

  return cancelledIntent
}
