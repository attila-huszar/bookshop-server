import { describe, expect, it } from 'bun:test'
import type { Order } from '@/types'

const { getEmailHtml } = await import('@/utils/email.utils')

const order: Order = {
  id: 1,
  paymentId: 'pi_test_123',
  paymentStatus: 'succeeded',
  lastStripeEventCreated: null,
  lastStripeEventId: null,
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
}

describe('order confirmation email', () => {
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
