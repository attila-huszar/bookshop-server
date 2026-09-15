import { stripe } from '@/libs'
import { paymentMessage } from '@/constants'
import { BadRequest } from '@/errors'
import type { StripePaymentIntent } from '@/types'
import { type PaymentAccess, resolveAuthorizedPayment } from '../shared'

export async function cancelPaymentIntent(
  paymentId: string,
  access: PaymentAccess,
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

  return await stripe.paymentIntents.cancel(validatedId)
}
