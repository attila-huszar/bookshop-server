import { Database } from 'bun:sqlite'
import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { ordersTable } from '@/models/sqlite/ordersTable'
import { orderInsertSchema, orderUpdateSchema } from '@/validation/orderSchemas'

const database = new Database(':memory:')
const sqlite = drizzle(database)
migrate(sqlite, { migrationsFolder: 'src/database/migrations' })
await mock.module('@/db', () => ({ sqlite }))
await mock.module('@/models', () => ({ default: { ordersTable } }))
const orders = await import('@/repositories/drizzle/orders.repo')

beforeEach(() => database.exec('DELETE FROM orders'))
afterAll(() => database.close())

const draft = {
  paymentId: null,
  checkoutRequestId: 'checkout-1',
  paymentStatus: 'processing' as const,
  total: 12.34,
  currency: 'USD',
  items: [
    {
      id: 1,
      title: 'Book',
      author: null,
      imgUrl: null,
      price: 12.34,
      discount: 0,
      quantity: 1,
    },
  ],
}

describe('SQLite checkout orders', () => {
  it('rejects null or missing checkout request IDs at the database boundary', () => {
    expect(() =>
      database.run(
        'INSERT INTO orders (total, currency, items, checkout_request_id) VALUES (?, ?, ?, ?)',
        [12.34, 'USD', '[]', null],
      ),
    ).toThrow('NOT NULL constraint failed: orders.checkout_request_id')
    expect(() =>
      database.run(
        'INSERT INTO orders (total, currency, items) VALUES (?, ?, ?)',
        [12.34, 'USD', '[]'],
      ),
    ).toThrow('NOT NULL constraint failed: orders.checkout_request_id')
  })

  it('requires a nonempty checkout request ID before inserting a draft', () => {
    for (const checkoutRequestId of [undefined, null, '']) {
      expect(
        orderInsertSchema.safeParse({ ...draft, checkoutRequestId }).success,
      ).toBe(false)
    }
    expect(orderInsertSchema.parse(draft).checkoutRequestId).toBe('checkout-1')
  })

  it('excludes the immutable checkout request ID from order updates', () => {
    expect(
      orderUpdateSchema.parse({
        checkoutRequestId: 'another-checkout',
        email: 'customer@example.com',
      }),
    ).toEqual({ email: 'customer@example.com' })
  })

  it('allows separate drafts with null payment IDs on a freshly created database', async () => {
    const first = await orders.createCheckoutOrder(draft)
    const second = await orders.createCheckoutOrder({
      ...draft,
      checkoutRequestId: 'checkout-2',
    })
    expect(first?.paymentId).toBeNull()
    expect(second?.paymentId).toBeNull()
    expect(first?.id).not.toBe(second?.id)
  })

  it('returns one persisted snapshot when concurrent attempts share a request key', async () => {
    const results = await Promise.all([
      orders.createCheckoutOrder(draft),
      orders.createCheckoutOrder({ ...draft, total: 99 }),
    ])
    expect(results[0]?.id).toBe(results[1]?.id)
    expect(results[1]?.total).toBe(12.34)
    expect(await orders.getAllOrders()).toHaveLength(1)
  })

  it('returns the linked order on subsequent checkout retries', async () => {
    const created = await orders.createCheckoutOrder(draft)
    if (!created) throw new Error('Expected draft')
    await orders.linkPaymentIntent(
      created.id,
      'pi_test',
      'requires_payment_method',
    )
    const replay = await orders.createCheckoutOrder(draft)
    expect(replay?.paymentId).toBe('pi_test')
    expect(replay?.id).toBe(created.id)
  })
})

describe('SQLite reconciliation updates', () => {
  it('selects stale pending orders and daily terminal audits, with missing paid markers treated as pending', async () => {
    const now = Date.now()
    const old = new Date(now - 2 * 60 * 60_000)
    const recent = new Date(now - 60_000)
    const checkedRecently = new Date(now - 10 * 60_000)
    const checkedEarlier = new Date(now - 40 * 60_000)
    const checkedYesterday = new Date(now - 25 * 60 * 60_000)
    const paidAt = old
    const states = [
      { checkoutRequestId: 'pending-never-checked', updatedAt: old },
      {
        checkoutRequestId: 'pending-due',
        updatedAt: old,
        lastReconciledAt: checkedEarlier,
      },
      {
        checkoutRequestId: 'pending-recently-checked',
        updatedAt: old,
        lastReconciledAt: checkedRecently,
      },
      { checkoutRequestId: 'recently-updated', updatedAt: recent },
      {
        checkoutRequestId: 'paid-due',
        updatedAt: old,
        paymentStatus: 'succeeded' as const,
        paidAt,
        lastReconciledAt: checkedYesterday,
      },
      {
        checkoutRequestId: 'paid-not-due',
        updatedAt: old,
        paymentStatus: 'succeeded' as const,
        paidAt,
        lastReconciledAt: checkedEarlier,
      },
      {
        checkoutRequestId: 'missing-paid-marker',
        updatedAt: old,
        paymentStatus: 'succeeded' as const,
        lastReconciledAt: checkedEarlier,
      },
      {
        checkoutRequestId: 'canceled-due',
        updatedAt: old,
        paymentStatus: 'canceled' as const,
        lastReconciledAt: checkedYesterday,
      },
    ]
    for (const state of states)
      await orders.createCheckoutOrder({
        ...draft,
        ...state,
        lastReconciliationAttemptAt: state.lastReconciledAt ?? null,
      })

    const query = {
      staleBefore: new Date(now - 5 * 60_000),
      checkedBefore: new Date(now - 30 * 60_000),
      terminalCheckedBefore: new Date(now - 24 * 60 * 60_000),
      limit: 100,
    }
    const candidates = await orders.getOrdersForReconciliation(query)
    expect(candidates.map((order) => order.checkoutRequestId)).toEqual([
      'pending-never-checked',
      'paid-due',
      'canceled-due',
      'pending-due',
      'missing-paid-marker',
    ])
    expect(
      await orders.getOrdersForReconciliation({ ...query, limit: 2 }),
    ).toHaveLength(2)
  })

  it('preserves millisecond check timestamps and throttles unmatched drafts', async () => {
    const created = await orders.createCheckoutOrder(draft)
    if (!created) throw new Error('Expected draft')
    const checkedAt = new Date('2026-10-05T12:34:56.789Z')
    await orders.markUnlinkedOrderReconciled(created.id, checkedAt)
    expect((await orders.getOrderById(created.id))?.lastReconciledAt).toEqual(
      checkedAt,
    )
    await orders.linkPaymentIntent(created.id, 'pi_test', 'processing')
    await orders.markUnlinkedOrderReconciled(created.id, new Date('2026-10-06'))
    expect((await orders.getOrder('pi_test'))?.lastReconciledAt).toEqual(
      checkedAt,
    )
  })

  it('paces failed attempts without marking them as successfully reconciled', async () => {
    const now = Date.now()
    const created = await orders.createCheckoutOrder({
      ...draft,
      updatedAt: new Date(now - 60 * 60_000),
    })
    if (!created) throw new Error('Expected draft')
    const attemptedAt = new Date(now)
    await orders.markOrderReconciliationAttempted(created.id, attemptedAt)
    const current = await orders.getOrderById(created.id)
    expect(current?.lastReconciliationAttemptAt).toEqual(attemptedAt)
    expect(current?.lastReconciledAt).toBeNull()
    // Ignore updatedAt here to exercise the separate retry-pacing predicate.
    const query = {
      staleBefore: new Date(now + 60_000),
      checkedBefore: new Date(now - 30 * 60_000),
      terminalCheckedBefore: new Date(now - 24 * 60 * 60_000),
      limit: 100,
    }
    expect(await orders.getOrdersForReconciliation(query)).toHaveLength(0)
    expect(
      await orders.getOrdersForReconciliation({
        ...query,
        checkedBefore: new Date(now + 1),
      }),
    ).toHaveLength(1)
  })

  it('rejects stale payment snapshots after a reconciliation or webhook wins', async () => {
    const created = await orders.createCheckoutOrder(draft)
    if (!created) throw new Error('Expected draft')
    const { order: initial } = await orders.linkPaymentIntent(
      created.id,
      'pi_test',
      'processing',
    )
    if (!initial) throw new Error('Expected linked order')
    const repaired = await orders.updateOrderIfUnchanged('pi_test', initial, {
      paymentStatus: 'requires_payment_method',
      lastReconciledAt: new Date(),
    })
    expect(repaired.order?.paymentStatus).toBe('requires_payment_method')
    expect(
      await orders.updateOrderIfUnchanged('pi_test', initial, {
        paymentStatus: 'requires_action',
        lastStripeEventCreated: 100,
        lastStripeEventId: 'evt_stale',
      }),
    ).toEqual({ order: null, becamePaid: false })

    if (!repaired.order) throw new Error('Expected reconciled order')
    const paid = await orders.updateOrderIfUnchanged(
      'pi_test',
      repaired.order,
      {
        paymentStatus: 'succeeded',
        paidAt: new Date(),
        lastStripeEventCreated: 101,
        lastStripeEventId: 'evt_paid',
      },
    )
    expect(paid.becamePaid).toBe(true)
    expect(
      await orders.updateOrderIfUnchanged('pi_test', repaired.order, {
        paymentStatus: 'succeeded',
        paidAt: new Date(),
        lastReconciledAt: new Date(),
      }),
    ).toEqual({ order: null, becamePaid: false })
  })

  it('guards same-second edits to the total and email, not just updatedAt', async () => {
    const created = await orders.createCheckoutOrder(draft)
    if (!created) throw new Error('Expected draft')
    const { order } = await orders.linkPaymentIntent(
      created.id,
      'pi_test',
      'processing',
    )
    if (!order) throw new Error('Expected linked order')
    await sqlite
      .update(ordersTable)
      .set({ total: 99, email: 'new@example.com', updatedAt: order.updatedAt })
      .where(eq(ordersTable.id, order.id))
    expect(
      await orders.updateOrderIfUnchanged('pi_test', order, {
        paymentStatus: 'succeeded',
        paidAt: new Date(),
      }),
    ).toEqual({ order: null, becamePaid: false })
  })
})
