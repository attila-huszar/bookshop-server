import type { MiddlewareHandler } from 'hono'
import { deleteCookie, getSignedCookie } from 'hono/cookie'
import { env, PAYMENT_SESSION, paymentCookieOptions } from '@/config'
import { errorHandler } from '@/errors'
import type { PaymentVariables } from '@/types'

export const paymentAccessMiddleware: MiddlewareHandler<{
  Variables: PaymentVariables
}> = async (c, next) => {
  try {
    const paymentSessionCookie = await getSignedCookie(
      c,
      env.cookieSecret!,
      PAYMENT_SESSION,
    )

    if (paymentSessionCookie === false) {
      deleteCookie(c, PAYMENT_SESSION, paymentCookieOptions)
    }

    const cookiePaymentId =
      typeof paymentSessionCookie === 'string'
        ? paymentSessionCookie
        : undefined

    const userEmail = c.get('authUser')?.email

    c.set('paymentAccess', { cookiePaymentId, userEmail })

    await next()
  } catch (error) {
    return errorHandler(c, error)
  }
}
