import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { Hono } from 'hono'
import { setSignedCookie } from 'hono/cookie'
import { sign } from 'hono/jwt'
import { env, PAYMENT_SESSION, paymentCookieOptions } from '@/config'

const mockGetUserProfile = mock()
await mock.module('@/services', () => ({
  getUserProfile: mockGetUserProfile,
}))

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
      paymentSessionId?: string
      userEmail?: string
    }
  }
}>()
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
    mockGetUserProfile.mockReset()
  })

  it('resolves the JWT user email and signed payment session together', async () => {
    mockGetUserProfile.mockResolvedValue({ email: 'account@example.com' })
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
      paymentSessionId: 'pi_session_123',
      userEmail: 'account@example.com',
    })
    expect(mockGetUserProfile).toHaveBeenCalledWith('user_123', {
      optional: true,
    })
  })
})
