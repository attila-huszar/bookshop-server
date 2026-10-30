import { describe, expect, it } from 'bun:test'
import { AdminNotification, type Order } from '@/types'

const { getEmailHtml, getEmailSubject } = await import('@/utils/email.utils')

const order: Order = {
  checkoutRequestId: 'checkout-email-test',
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
  total: 12.34,
  currency: 'USD',
  items: [],
  firstName: 'Casey',
  lastName: 'Customer',
  email: 'customer@example.com',
  shipping: {
    name: 'Casey Customer',
    address: {
      line1: '1 Main Street',
      line2: null,
      city: 'Springfield',
      state: 'IL',
      postal_code: '62701',
      country: 'US',
    },
  },
  createdAt: new Date('2026-09-23T09:55:00.000Z'),
  updatedAt: new Date('2026-09-23T10:00:00.000Z'),
  deletedAt: null,
}

describe('order confirmation email', () => {
  it('uses rounded discounted unit prices for receipt line totals', async () => {
    const html = await getEmailHtml({
      type: 'orderConfirmation',
      toAddress: order.email!,
      toName: 'Casey',
      order: {
        ...order,
        total: 799,
        items: [
          {
            title: 'Discounted book',
            price: 9.99,
            discount: 20,
            quantity: 100,
          },
        ],
      },
    })

    expect(html).toContain('799.00')
    expect(html).not.toContain('799.20')
  })

  it('includes the shipping postal code in the address', async () => {
    const html = await getEmailHtml({
      type: 'orderConfirmation',
      toAddress: 'customer@example.com',
      toName: 'Casey',
      order,
    })

    expect(html).toContain('62701')
  })
})

describe('account email rendering', () => {
  it.each(['verification', 'passwordReset'] as const)(
    'renders %s with its token link and escaped recipient name',
    async (type) => {
      const tokenLink = 'https://bookshop.test/account?token=test-token'
      const html = await getEmailHtml({
        type,
        toAddress: 'customer@example.com',
        toName: 'Casey <script>alert(1)</script>',
        tokenLink,
      })

      expect(html).toContain(tokenLink)
      expect(html).toContain('Casey &lt;script&gt;alert(1)&lt;/script&gt;')
      expect(html).not.toContain('<script>alert(1)</script>')
    },
  )
})

describe('admin email rendering', () => {
  it('renders the payment summary and escapes customer and item text', async () => {
    const html = await getEmailHtml({
      type: 'adminPaymentNotification',
      notificationType: AdminNotification.New,
      toAddress: 'admin@example.com',
      emailTitle: 'New order',
      paymentId: order.paymentId,
      customerName: 'Casey <Customer>',
      customerEmail: 'customer@example.com',
      items: [
        { title: 'Book <Title>', price: 12.34, discount: 0, quantity: 1 },
      ],
      total: order.total,
      currency: order.currency,
      paymentStatus: order.paymentStatus,
      shippingAddress: '1 Main Street<br />Springfield',
    })

    expect(html).toContain('New order')
    expect(html).toContain('Casey &lt;Customer&gt;')
    expect(html).toContain('Book &lt;Title&gt;')
    expect(html).toContain('12.34')
    expect(html).toContain('Springfield')
    expect(html).not.toContain('Open Stripe Dashboard')
  })

  it.each([false, true])(
    'highlights the reason, retry policy and correct Stripe dashboard mode (%s)',
    async (liveMode) => {
      const html = await getEmailHtml({
        type: 'adminPaymentNotification',
        notificationType: AdminNotification.Error,
        toAddress: 'admin@example.com',
        emailTitle: 'Reconciliation failed',
        paymentId: order.paymentId,
        customerName: 'Casey',
        customerEmail: 'customer@example.com',
        items: [],
        total: order.total,
        currency: order.currency,
        paymentStatus: 'succeeded',
        shippingAddress: '',
        reconciliation: {
          alertId: 'alert-1',
          orderId: 1,
          reason: 'Amount differs <script>bad()</script>',
          failures: 3,
          liveMode,
        },
      })
      expect(html).toContain(
        'Amount differs &lt;script&gt;bad()&lt;/script&gt;',
      )
      expect(html).not.toContain('<script>bad()</script>')
      expect(html).toContain(
        'https://dashboard.stripe.com/' +
          (liveMode ? '' : 'test/') +
          'payments/pi_test_123',
      )
      expect(html).toContain('Automatic checks will continue')
      expect(html.replace(/\s+/g, ' ')).toContain(
        'No further alert will be sent for this incident',
      )
      expect(html).toContain('Failed checks:')
    },
  )
})

describe('email subjects', () => {
  const recipient = {
    toAddress: 'customer@example.com',
    toName: 'Casey',
    tokenLink: 'https://bookshop.test/verification?token=test-token',
  }

  it('uses the registered verification subject', () => {
    expect(getEmailSubject({ type: 'verification', ...recipient })).toBe(
      'Bookshop - Verify your email address',
    )
  })

  it('uses the registered password-reset subject', () => {
    expect(getEmailSubject({ type: 'passwordReset', ...recipient })).toBe(
      'Bookshop - Forgotten Password',
    )
  })

  it('uses the registered order-confirmation subject', () => {
    expect(
      getEmailSubject({ type: 'orderConfirmation', ...recipient, order }),
    ).toBe('Bookshop - Order Confirmation')
  })

  it.each([
    [AdminNotification.New, '🆕 NEW ORDER'],
    [AdminNotification.Error, '❌ RECONCILIATION FAILED'],
  ] as const)(
    'keeps admin subjects dynamic for %s alerts',
    (notificationType, label) => {
      const subject = getEmailSubject({
        type: 'adminPaymentNotification',
        notificationType,
        toAddress: 'admin@example.com',
        emailTitle: 'Order',
        paymentId: order.paymentId,
        customerName: 'Casey',
        customerEmail: 'customer@example.com',
        items: [],
        total: order.total,
        currency: order.currency,
        paymentStatus: order.paymentStatus,
        shippingAddress: '',
      })

      expect(subject).toStartWith('Order #')
      expect(subject).toEndWith(` | ${label}`)
    },
  )
})
