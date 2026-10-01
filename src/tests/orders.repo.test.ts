import { Database } from 'bun:sqlite'
import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test'
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
