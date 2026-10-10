export class ReconciliationFailure extends Error {}

/** Keep SQL, credentials and raw provider messages out of notification payloads. */
export function reconciliationFailureReason(error: unknown): string {
  if (error instanceof ReconciliationFailure) {
    return error.message
  }

  const type =
    error && typeof error === 'object' && 'type' in error ? error.type : null

  switch (type) {
    case 'StripeConnectionError':
      return 'Stripe could not be reached. The payment status could not be verified.'
    case 'StripeAuthenticationError':
    case 'StripePermissionError':
      return 'Stripe rejected API access. Check the server API key and permissions.'
    case 'StripeRateLimitError':
      return 'Stripe rate limited the reconciliation requests.'
    case 'StripeInvalidRequestError':
      return 'Stripe could not retrieve the referenced payment. Check the payment reference and Stripe account.'
    case 'StripeAPIError':
      return 'Stripe returned a server error while checking the payment.'
    default:
      return 'The order could not be read or updated reliably. Check the server logs and database availability.'
  }
}
