import { beforeEach, describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { setSignedCookie } from 'hono/cookie'
import { sign } from 'hono/jwt'
import { env, PAYMENT_SESSION, paymentCookieOptions } from '@/config'
import { errorHandler } from '@/errors/errorHandler'
import { mockUsersDB } from './test-setup'

env.cookieSecret ??= 'cookie_test_secret'
env.jwtAccessSecret ??= 'jwt_test_secret'

const [{ optionalAuthMiddleware }, { paymentAccessMiddleware }] =
  await Promise.all([
    import('@/middleware/optionalAuth.middleware'),
    import('@/middleware/paymentAccess.middleware'),
  ])

const app = new Hono<{
  Variables: {
    paymentAccess?: {
      cookiePaymentId?: string
      userEmail?: string
    }
  }
}>()
app.onError((error, c) => errorHandler(c, error))
app.get('/make-session-cookie', async (c) => {
  await setSignedCookie(
    c,
    PAYMENT_SESSION,
    'pi_session_123',
    env.cookieSecret!,
    paymentCookieOptions,
  )
  return c.text('ok')
})
app.use('/payments/:paymentId', optionalAuthMiddleware, paymentAccessMiddleware)
app.get('/payments/:paymentId', (c) => c.json(c.get('paymentAccess')))

describe('paymentAccessMiddleware', () => {
  beforeEach(() => {
    mockUsersDB.getActiveUserBy.mockReset()
  })

  it('resolves the JWT user email and signed payment session together', async () => {
    mockUsersDB.getActiveUserBy.mockResolvedValue({
      email: 'account@example.com',
    })
    const cookieResponse = await app.request('/make-session-cookie')
    const cookie = cookieResponse.headers.get('set-cookie')?.split(';')[0]
    const token = await sign(
      { uuid: 'user_123', exp: Math.floor(Date.now() / 1000) + 60 },
      env.jwtAccessSecret!,
    )

    const response = await app.request('/payments/pi_session_123', {
      headers: {
        authorization: `Bearer ${token}`,
        cookie: cookie!,
      },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      cookiePaymentId: 'pi_session_123',
      userEmail: 'account@example.com',
    })
    expect(mockUsersDB.getActiveUserBy).toHaveBeenCalledWith('uuid', 'user_123')
    expect(mockUsersDB.getActiveUserBy).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, 'Bearer invalid-token'])(
    'keeps signed guest payment access without an active token: %s',
    async (authorization) => {
      const cookieResponse = await app.request('/make-session-cookie')
      const cookie = cookieResponse.headers.get('set-cookie')!.split(';')[0]!
      const response = await app.request('/payments/pi_session_123', {
        headers: { cookie, ...(authorization ? { authorization } : {}) },
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        cookiePaymentId: 'pi_session_123',
      })
      expect(mockUsersDB.getActiveUserBy).not.toHaveBeenCalled()
    },
  )

  it('retains the signed guest cookie when the token belongs to a deleted account', async () => {
    mockUsersDB.getActiveUserBy.mockResolvedValueOnce(null)
    const cookieResponse = await app.request('/make-session-cookie')
    const cookie = cookieResponse.headers.get('set-cookie')!.split(';')[0]!
    const token = await sign(
      { uuid: 'deleted-user', exp: Math.floor(Date.now() / 1000) + 60 },
      env.jwtAccessSecret!,
    )
    const response = await app.request('/payments/pi_session_123', {
      headers: { cookie, authorization: 'Bearer ' + token },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ cookiePaymentId: 'pi_session_123' })
    expect(mockUsersDB.getActiveUserBy).toHaveBeenCalledTimes(1)
  })

  it('propagates an account lookup outage instead of treating an authenticated request as a guest', async () => {
    mockUsersDB.getActiveUserBy.mockRejectedValueOnce(
      new Error('Database offline'),
    )
    const token = await sign(
      { uuid: 'user_123', exp: Math.floor(Date.now() / 1000) + 60 },
      env.jwtAccessSecret!,
    )
    const response = await app.request('/payments/pi_session_123', {
      headers: { authorization: 'Bearer ' + token },
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ code: 'INTERNAL_ERROR' })
    expect(mockUsersDB.getActiveUserBy).toHaveBeenCalledTimes(1)
  })
})
