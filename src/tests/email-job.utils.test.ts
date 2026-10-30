import { describe, expect, it } from 'bun:test'
import { env } from '@/config'
import {
  accountEmailIntent,
  createEmailIntent,
  orderPaidEmails,
} from '@/utils/email-job.utils'
import { EMAIL } from '@/constants/email'
import { AdminNotification, type EmailOutboxDraft, type Order } from '@/types'

const createOrder = (overrides: Partial<Order> = {}): Order => ({
  checkoutRequestId: 'checkout-email-intents-test',
  termsAcceptance: null,
  id: 1,
  paymentId: 'pi_test_123',
  paymentStatus: 'succeeded',
  lastStripeEventCreated: null,
  lastStripeEventId: null,
  lastReconciledAt: null,
  reconciliationFailures: 0,
  reconciliationAlertId: null,
  lastReconciliationAttemptAt: null,
  paidAt: new Date('2026-09-23T10:00:00.000Z'),
  total: 25.99,
  currency: 'USD',
  items: [],
  firstName: null,
  lastName: null,
  email: 'customer@example.com',
  shipping: null,
  createdAt: new Date('2026-09-23T09:55:00.000Z'),
  updatedAt: new Date('2026-09-23T10:00:00.000Z'),
  deletedAt: null,
  ...overrides,
})

describe('email definitions', () => {
  it('keys definitions by their payload type for direct lookup', () => {
    for (const [type, definition] of Object.entries(EMAIL)) {
      expect(type).toBe(definition.type)
    }
  })
})

describe('accountEmailIntent', () => {
  const user = {
    email: 'saved@example.com',
    firstName: 'Saved Name',
    verificationToken: 'verification/token',
    passwordResetToken: 'reset&token',
  }

  it.each([
    ['verification', 'verification', user.verificationToken],
    ['passwordReset', 'password-reset', user.passwordResetToken],
  ] as const)(
    'builds the %s link from the saved token',
    (type, path, token) => {
      const intent = accountEmailIntent(type, user)

      expect(intent.payload).toEqual({
        type,
        toAddress: user.email,
        toName: user.firstName,
        tokenLink: `${env.clientBaseUrl}/${path}?token=${encodeURIComponent(token)}`,
      })
    },
  )

  it.each(['verification', 'passwordReset'] as const)(
    'rejects a missing %s token instead of committing an unusable link',
    (type) => {
      expect(() =>
        accountEmailIntent(type, {
          ...user,
          verificationToken: null,
          passwordResetToken: null,
        }),
      ).toThrow(`Cannot create ${type} email without a token`)
    },
  )
})

describe('createEmailIntent', () => {
  it.each(['verification', 'passwordReset'] as const)(
    'always creates a draft for %s emails',
    (type) => {
      const data = {
        toAddress: 'customer@example.com',
        toName: 'Customer',
        tokenLink: 'https://bookshop.test/?token=token',
      }
      // This assignment also checks the non-null return type during typecheck.
      const intent: EmailOutboxDraft = createEmailIntent({ type, data })

      expect(intent.payload).toEqual({ type, ...data })
      expect(intent.id).toBeString()
      expect(intent.availableAt).toBeInstanceOf(Date)
    },
  )

  it('skips customer confirmation for a guest without an email', () => {
    const intent = createEmailIntent({
      type: 'orderConfirmation',
      data: { order: createOrder({ email: null }) },
    })

    expect(intent).toBeNull()
  })

  it('uses the last name when the first name is missing', () => {
    const intent = createEmailIntent({
      type: 'orderConfirmation',
      data: { order: createOrder({ lastName: 'Example' }) },
    })

    expect(intent?.payload).toMatchObject({
      toAddress: 'customer@example.com',
      toName: 'Example',
    })
  })

  it('uses a generic name when both customer names are missing', () => {
    const intent = createEmailIntent({
      type: 'orderConfirmation',
      data: { order: createOrder() },
    })

    expect(intent?.payload).toMatchObject({ toName: 'Valued Customer' })
  })

  it('creates a mail summary without internal order bookkeeping', () => {
    const intent = createEmailIntent({
      type: 'orderConfirmation',
      data: { order: createOrder() },
    })

    if (intent?.payload.type !== 'orderConfirmation') {
      throw new Error('Expected order confirmation')
    }

    expect(intent.payload.order).not.toHaveProperty('checkoutRequestId')
    expect(intent.payload.order).not.toHaveProperty('lastStripeEventId')
    expect(intent.payload.order).not.toHaveProperty('paidAt')
  })

  it('uses an alert ID to deduplicate an error across queue retries', () => {
    const input = {
      type: 'adminPaymentNotification',
      data: {
        order: createOrder(),
        notificationType: AdminNotification.Error,
        reconciliation: {
          alertId: 'alert-1',
          reason: 'Stripe unavailable',
          failures: 3,
          orderId: 1,
          liveMode: false,
        },
      },
    } as const
    const first: EmailOutboxDraft = createEmailIntent(input)
    const second: EmailOutboxDraft = createEmailIntent(input)

    expect(first.id).toBe('admin-error-alert-1')
    expect(second.id).toBe(first.id)
  })

  it('publishes an approved reconciliation alert without another delay', () => {
    const before = Date.now()
    const intent = createEmailIntent({
      type: 'adminPaymentNotification',
      data: { order: createOrder(), notificationType: AdminNotification.Error },
    })
    const after = Date.now()

    expect(intent.availableAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(intent.availableAt.getTime()).toBeLessThanOrEqual(after)
  })
})

describe('order email intents', () => {
  it('assigns stable first-paid IDs at construction', () => {
    const order = createOrder()
    const paid = orderPaidEmails(order)

    expect(paid.map((intent) => intent.id)).toEqual([
      'order-confirmed-pi_test_123',
      'admin-new-pi_test_123',
    ])
    expect(orderPaidEmails(order).map((intent) => intent.id)).toEqual(
      paid.map((intent) => intent.id),
    )
    expect(
      createEmailIntent({ type: EMAIL.orderConfirmation.type, data: { order } })
        ?.id,
    ).toBe(paid[0]?.id)
  })

  it('uses the same item allowlist for customer and admin confirmations', () => {
    const item = {
      id: 1,
      title: 'Book',
      author: 'Author',
      imgUrl: 'book.jpg',
      price: 12.34,
      discount: 10,
      quantity: 2,
    }
    const intents = orderPaidEmails(createOrder({ items: [item] }))
    const customer = intents[0]?.payload
    const admin = intents[1]?.payload

    if (
      customer?.type !== EMAIL.orderConfirmation.type ||
      admin?.type !== EMAIL.adminPaymentNotification.type
    ) {
      throw new Error('Expected customer and admin confirmations')
    }

    const summary = [
      {
        title: item.title,
        price: item.price,
        discount: item.discount,
        quantity: item.quantity,
      },
    ]

    expect(customer.order.items).toEqual(summary)
    expect(admin.items).toEqual(summary)
  })

  it('creates only the admin confirmation for a guest without email', () => {
    expect(
      orderPaidEmails(createOrder({ email: null })).map((intent) => intent.id),
    ).toEqual(['admin-new-pi_test_123'])
  })
})
