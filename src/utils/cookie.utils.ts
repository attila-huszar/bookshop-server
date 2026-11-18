import type { Context } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import {
  cookieOptions,
  GOOGLE_AUTH_SESSION,
  googleCookieOptions,
  PAYMENT_SESSION,
  paymentCookieOptions,
  REFRESH_TOKEN,
} from '@/config/cookieOptions'
import { env } from '@/config/env'

export function getRefreshCookie(c: Context) {
  return getSignedCookie(c, env.cookieSecret!, REFRESH_TOKEN)
}

export function setRefreshCookie(c: Context, refreshToken: string) {
  return setSignedCookie(
    c,
    REFRESH_TOKEN,
    refreshToken,
    env.cookieSecret!,
    cookieOptions,
  )
}

export function clearRefreshCookie(c: Context): void {
  deleteCookie(c, REFRESH_TOKEN, cookieOptions)
}

export function getGoogleAuthCookie(c: Context) {
  return getSignedCookie(c, env.cookieSecret!, GOOGLE_AUTH_SESSION)
}

export function setGoogleAuthCookie(c: Context, sessionId: string) {
  return setSignedCookie(
    c,
    GOOGLE_AUTH_SESSION,
    sessionId,
    env.cookieSecret!,
    googleCookieOptions,
  )
}

export function clearGoogleAuthCookie(c: Context): void {
  deleteCookie(c, GOOGLE_AUTH_SESSION, googleCookieOptions)
}

export function getPaymentCookie(c: Context) {
  return getSignedCookie(c, env.cookieSecret!, PAYMENT_SESSION)
}

export function setPaymentCookie(c: Context, paymentId: string) {
  return setSignedCookie(
    c,
    PAYMENT_SESSION,
    paymentId,
    env.cookieSecret!,
    paymentCookieOptions,
  )
}

export function clearPaymentCookie(c: Context): void {
  deleteCookie(c, PAYMENT_SESSION, paymentCookieOptions)
}
