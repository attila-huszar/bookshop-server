import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { Hono } from 'hono'
import { setSignedCookie } from 'hono/cookie'
import { env, PAYMENT_SESSION, paymentCookieOptions } from '@/config'
import { paymentAccessMiddleware } from '@/middleware/paymentAccess.middleware'
import { acceptPaymentTermsSchema } from '@/validation/paymentSchemas'
import { defaultTermsStatements } from '@/constants/defaults'
import { errorHandler } from '@/errors/errorHandler'
import type { Order, TermsAcceptance } from '@/types'
import {
  mockOrdersDB,
  mockRepositories,
  mockTermsDB,
  mockValidate,
} from './test-setup'

await mockRepositories()

const { acceptPaymentTerms, getPaymentTerms } =
  await import('@/services/payments.service')
const { payments } = await import('@/controller/payments.controller')
const terms = {
  url: 'https://bookshop.test/terms/11111111-1111-4111-8111-111111111111',
  version: '11111111-1111-4111-8111-111111111111',
  publishedAt: '2026-10-14T10:00:00Z',
  statements: defaultTermsStatements,
}
const request = { version: terms.version, accepted: true, language: 'en' }
const access = { cookiePaymentId: 'pi_terms' }
const originalClientBaseUrl = env.clientBaseUrl
const originalCookieSecret = env.cookieSecret

const app = new Hono()
  .onError((error, c) => errorHandler(c, error))
  .get('/terms-cookie', async (c) => {
    await setSignedCookie(
      c,
      PAYMENT_SESSION,
      'pi_terms',
      env.cookieSecret!,
      paymentCookieOptions,
    )

    return c.text('OK')
  })
  .use('/payments/:paymentId/*', paymentAccessMiddleware)
  .route('/', payments)

const order: Order = {
  id: 1,
  paymentId: 'pi_terms',
  checkoutRequestId: 'checkout-terms',
  termsAcceptance: null,
  paymentStatus: 'requires_payment_method',
  total: 12,
  currency: 'USD',
  items: [
    {
      id: 1,
      title: 'Ordered book',
      author: 'Author',
      imgUrl: '',
      price: 12,
      discount: 0,
      quantity: 1,
    },
  ],
  email: null,
  firstName: null,
  lastName: null,
  shipping: null,
  paidAt: null,
  lastStripeEventCreated: null,
  lastStripeEventId: null,
  lastReconciledAt: null,
  lastReconciliationAttemptAt: null,
  reconciliationFailures: 0,
  reconciliationAlertId: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  env.clientBaseUrl = 'https://bookshop.test'
  mockTermsDB.getCurrentTerms.mockReset().mockResolvedValue({
    version: terms.version,
    content: { en: 'English terms', hu: 'Magyar feltételek' },
    statements: defaultTermsStatements,
    publishedAt: '2026-10-14T10:00:00Z',
  })
  env.cookieSecret = 'terms-cookie-test-secret'
  mockValidate
    .mockReset()
    .mockImplementation((_schema: unknown, value: unknown) => value)
  mockOrdersDB.getOrder.mockReset().mockResolvedValue(order)
  mockOrdersDB.recordTermsAcceptance
    .mockReset()
    .mockImplementation((_paymentId: string, acceptance: TermsAcceptance) =>
      Promise.resolve({ ...order, termsAcceptance: acceptance }),
    )
})

afterEach(() => {
  env.clientBaseUrl = originalClientBaseUrl
  env.cookieSecret = originalCookieSecret
})

describe('Checkout terms', () => {
  it('displays and records the declaration stored with the published version', async () => {
    const statements = {
      en: 'Version-specific English declaration',
      hu: 'A verzióhoz tartozó magyar nyilatkozat',
    }
    mockTermsDB.getCurrentTerms.mockResolvedValue({
      version: terms.version,
      content: { en: 'English terms', hu: 'Magyar feltételek' },
      statements,
      publishedAt: '2026-10-14T10:00:00Z',
    })

    expect(
      (await getPaymentTerms('pi_terms', access)).terms?.statements,
    ).toEqual(statements)
    expect(
      await acceptPaymentTerms(
        'pi_terms',
        { ...request, language: 'hu' },
        access,
      ),
    ).toMatchObject({
      version: terms.version,
      language: 'hu',
      statement: statements.hu,
    })
  })

  it('records the Hungarian declaration when checkout is in Hungarian', async () => {
    expect(
      await acceptPaymentTerms(
        'pi_terms',
        { ...request, language: 'hu' },
        access,
      ),
    ).toMatchObject({
      language: 'hu',
      statement:
        'Elolvastam és elfogadom az Általános Szerződési Feltételeket (ÁSZF).',
    })
  })

  it('serves both endpoints with a signed guest cookie', async () => {
    const cookieResponse = await app.request('/terms-cookie')
    const cookie = cookieResponse.headers.get('set-cookie')!.split(';')[0]!
    const reviewResponse = await app.request('/payments/pi_terms/terms', {
      headers: { cookie },
    })

    expect(reviewResponse.status).toBe(200)
    expect(reviewResponse.headers.get('cache-control')).toBe('no-store')
    expect(await reviewResponse.json()).toMatchObject({ terms })
    const acceptanceResponse = await app.request('/payments/pi_terms/terms', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })

    expect(acceptanceResponse.status).toBe(200)
    expect(await acceptanceResponse.json()).toMatchObject({
      version: terms.version,
    })
  })

  it('rejects guest endpoint access without the signed cookie', async () => {
    const reviewResponse = await app.request('/payments/pi_terms/terms')
    const acceptanceResponse = await app.request('/payments/pi_terms/terms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })

    expect(reviewResponse.status).toBe(401)
    expect(acceptanceResponse.status).toBe(401)
    expect(mockOrdersDB.recordTermsAcceptance).not.toHaveBeenCalled()
  })

  it('returns the persisted order summary and configured terms without a payment token', async () => {
    const review = await getPaymentTerms('pi_terms', access)

    expect(review).toMatchObject({
      terms,
      order: {
        total: 12,
        currency: 'USD',
      },
    })
    expect(review.order.items[0]?.title).toBe('Ordered book')
    expect(review.order.items[0]?.price).toBe(12)
    expect(review).not.toHaveProperty('paymentToken')
    expect(review).not.toHaveProperty('checkoutRequestId')
  })

  it('requires terms to be published before accepting payment', async () => {
    mockTermsDB.getCurrentTerms.mockResolvedValue(null)

    expect((await getPaymentTerms('pi_terms', access)).terms).toBeNull()
    await rejects(acceptPaymentTerms('pi_terms', request, access), {
      status: 503,
    })
    expect(mockOrdersDB.recordTermsAcceptance).not.toHaveBeenCalled()
  })

  it.each([undefined, 'fr', true])(
    'rejects unsupported or missing acceptance language: %s',
    async (language) => {
      await rejects(
        acceptPaymentTerms('pi_terms', { ...request, language }, access),
      )
      expect(mockOrdersDB.recordTermsAcceptance).not.toHaveBeenCalled()
    },
  )

  it.each([undefined, false, 'true', 1])(
    'requires explicit boolean acceptance: %s',
    async (accepted) => {
      const input = { ...request, accepted }

      expect(acceptPaymentTermsSchema.safeParse(input).success).toBe(false)
      await rejects(acceptPaymentTerms('pi_terms', input, access))
      expect(mockOrdersDB.recordTermsAcceptance).not.toHaveBeenCalled()
    },
  )

  it.each([
    { acceptedAt: '2020-01-01' },
    { statement: 'Client-provided declaration' },
    { url: terms.url },
  ])('rejects client-supplied acceptance details: %j', async (details) => {
    const input = { ...request, ...details }

    expect(acceptPaymentTermsSchema.safeParse(input).success).toBe(false)
    await rejects(acceptPaymentTerms('pi_terms', input, access))
    expect(mockOrdersDB.recordTermsAcceptance).not.toHaveBeenCalled()
  })

  it.each([undefined, '', 'old'])(
    'rejects missing or malformed document versions: %s',
    async (version) => {
      await rejects(
        acceptPaymentTerms('pi_terms', { ...request, version }, access),
      )
      expect(mockOrdersDB.recordTermsAcceptance).not.toHaveBeenCalled()
    },
  )

  it('rejects a different document version', async () => {
    await rejects(
      acceptPaymentTerms(
        'pi_terms',
        {
          ...request,
          version: '22222222-2222-4222-8222-222222222222',
        },
        access,
      ),
      {
        status: 412,
      },
    )
    expect(mockOrdersDB.recordTermsAcceptance).not.toHaveBeenCalled()
  })

  it('requires access to the order before recording consent', async () => {
    await rejects(
      acceptPaymentTerms('pi_terms', request, { cookiePaymentId: 'pi_other' }),
      { status: 401 },
    )
    expect(mockOrdersDB.recordTermsAcceptance).not.toHaveBeenCalled()
  })

  it('records a server timestamp and the declaration for guest checkout', async () => {
    const before = Date.now()
    const acceptance = await acceptPaymentTerms('pi_terms', request, access)

    expect(acceptance).toMatchObject({
      version: terms.version,
      language: 'en',
      statement: 'I have read and accept the Terms and Conditions.',
    })
    expect(Date.parse(acceptance.acceptedAt)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(acceptance.acceptedAt)).toBeLessThanOrEqual(Date.now())
    expect(mockOrdersDB.recordTermsAcceptance).toHaveBeenCalledWith(
      'pi_terms',
      acceptance,
    )
    expect(acceptance).not.toHaveProperty('url')
  })

  it('supports authenticated ownership without the payment cookie', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce({
      ...order,
      email: 'reader@example.com',
    })

    expect(
      await acceptPaymentTerms('pi_terms', request, {
        userEmail: 'reader@example.com',
      }),
    ).toMatchObject({ version: terms.version })
  })

  it.each(['https://bookshop.test', 'https://new-bookshop.test'])(
    'preserves the acceptance when retrying on %s',
    async (clientBaseUrl) => {
      const acceptance = await acceptPaymentTerms('pi_terms', request, access)
      env.clientBaseUrl = clientBaseUrl
      mockOrdersDB.getOrder.mockResolvedValueOnce({
        ...order,
        termsAcceptance: acceptance,
      })

      expect(await acceptPaymentTerms('pi_terms', request, access)).toEqual(
        acceptance,
      )
      expect(mockOrdersDB.recordTermsAcceptance).toHaveBeenCalledTimes(1)
    },
  )

  it('does not replace acceptance of a different document after a concurrent update', async () => {
    mockOrdersDB.recordTermsAcceptance.mockResolvedValueOnce({
      ...order,
      termsAcceptance: {
        version: 'old',
        language: 'en',
        acceptedAt: new Date().toISOString(),
        statement: 'Original',
      },
    })

    await rejects(acceptPaymentTerms('pi_terms', request, access), {
      status: 412,
    })
  })

  it('fails when the repository could not store acceptance', async () => {
    mockOrdersDB.recordTermsAcceptance.mockResolvedValueOnce(order)

    await rejects(acceptPaymentTerms('pi_terms', request, access), {
      status: 409,
    })
  })

  it.each([
    { ...order, deletedAt: new Date() },
    { ...order, paymentStatus: 'canceled' as const },
  ])('rejects an ended checkout', async (ended) => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(ended)

    await rejects(acceptPaymentTerms('pi_terms', request, access), {
      status: 410,
    })
    expect(mockOrdersDB.recordTermsAcceptance).not.toHaveBeenCalled()
  })
})
