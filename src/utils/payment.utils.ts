import { createHash } from 'node:crypto'
import type { PaymentIntentRequest, PublicUser } from '@/types'

/**
 * Stripe idempotency is account-wide. Bind the key to the checkout principal
 * and request contents so a reused client key cannot replay another cart.
 */
export function getPaymentIdempotencyKey(
  clientRequestId: string,
  request: PaymentIntentRequest,
  user: PublicUser | null,
): string {
  const scope = user?.uuid ?? 'guest'
  const fingerprint = JSON.stringify({
    clientRequestId,
    request,
    scope,
  })

  return `bookshop:${createHash('sha256').update(fingerprint).digest('hex')}`
}
