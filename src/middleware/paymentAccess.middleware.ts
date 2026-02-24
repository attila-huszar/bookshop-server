import type { MiddlewareHandler } from 'hono'
import { deleteCookie, getSignedCookie } from 'hono/cookie'
import { env, PAYMENT_SESSION, paymentCookieOptions } from '@/config'
import { getUserProfile } from '@/services'
import { errorHandler } from '@/errors'

type Variables = {
  jwtPayload?: {
    uuid: string
  }
  paymentAccess?: {
    paymentSessionId?: string
    userEmail?: string
  }
}

export const paymentAccessMiddleware: MiddlewareHandler<{
  Variables: Variables
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

    const paymentSessionId =
      typeof paymentSessionCookie === 'string'
        ? paymentSessionCookie
        : undefined

    const jwtPayload = c.get('jwtPayload')
    let userEmail: string | undefined

    if (jwtPayload?.uuid) {
      const user = await getUserProfile(jwtPayload.uuid, { optional: true })
      userEmail = user?.email
    }

    c.set('paymentAccess', { paymentSessionId, userEmail })

    await next()
  } catch (error) {
    return errorHandler(c, error)
  }
}
