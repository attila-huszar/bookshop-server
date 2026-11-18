import type { MiddlewareHandler } from 'hono'
import { clearPaymentCookie, getPaymentCookie } from '@/utils/cookie.utils'
import { errorHandler } from '@/errors'
import type { PaymentVariables } from '@/types'

export const paymentAccessMiddleware: MiddlewareHandler<{
  Variables: PaymentVariables
}> = async (c, next) => {
  try {
    const paymentSessionCookie = await getPaymentCookie(c)

    if (paymentSessionCookie === false) {
      clearPaymentCookie(c)
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
