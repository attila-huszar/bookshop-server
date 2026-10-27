import { Database } from 'bun:sqlite'
import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { env } from '@/config'
import { emailOutboxTable } from '@/models/sqlite/emailOutboxTable'
import { ordersTable } from '@/models/sqlite/ordersTable'
import { orderInsertSchema, orderUpdateSchema } from '@/validation/orderSchemas'
import { emailOutboxResponse } from '@/utils/email-outbox.utils'
import { defaultTermsStatements } from '@/constants/defaults'
import {
  AdminNotification,
  type UserRegistrationInsert,
  UserRole,
} from '@/types'

const database = new Database(':memory:')
const sqlite = drizzle(database)

migrate(sqlite, { migrationsFolder: 'src/database/migrations' })
await mock.module('@/db', () => ({
  sqlite,
  connectDatabase: mock(),
  closeDatabase: mock(),
}))
const orders = await import('@/repositories/drizzle/orders.repo')
const books = await import('@/repositories/drizzle/books.repo')
const authors = await import('@/repositories/drizzle/authors.repo')
const terms = await import('@/repositories/drizzle/terms.repo')

describe('SQLite missing CMS records', () => {
  it('returns null for missing books and authors so services can report 404', async () => {
    expect(await books.updateBook(999999, { title: 'Updated' })).toBeNull()
    expect(await authors.updateAuthor(999999, { name: 'Updated' })).toBeNull()
  })
})

describe('SQLite terms documents', () => {
  it('applies bilingual statement defaults to direct SQL inserts', async () => {
    database
      .query(
        'INSERT INTO terms_documents (version, content, published_at) VALUES (?, ?, ?)',
      )
      .run(
        '33333333-3333-4333-8333-333333333333',
        JSON.stringify({ en: 'English terms', hu: 'Magyar feltételek' }),
        Date.now(),
      )

    expect((await terms.getCurrentTerms())?.statements).toEqual(
      defaultTermsStatements,
    )
  })

  it('publishes a new version without modifying archived terms', async () => {
    const first = {
      version: '11111111-1111-4111-8111-111111111111',
      content: { en: 'Original English', hu: 'Eredeti magyar' },
      statements: { en: 'Original declaration', hu: 'Eredeti nyilatkozat' },
      publishedAt: '2026-10-14T10:00:00.000Z',
    }
    const second = {
      version: '22222222-2222-4222-8222-222222222222',
      content: { en: 'Updated English', hu: 'Új magyar' },
      publishedAt: '2026-10-14T10:01:00.000Z',
    }

    expect(await terms.getCurrentTerms()).toBeNull()
    expect(await terms.getTermsHistory()).toEqual([])
    await terms.publishTerms(first)
    await terms.publishTerms(second)

    expect(await terms.getTermsHistory()).toEqual([
      {
        version: second.version,
        publishedAt: second.publishedAt,
        canDelete: true,
      },
      {
        version: first.version,
        publishedAt: first.publishedAt,
        canDelete: true,
      },
    ])
    expect(await terms.getCurrentTerms()).toEqual({
      ...second,
      statements: defaultTermsStatements,
    })
    expect(await terms.getTermsByVersion(first.version)).toEqual(first)
    expect(await terms.getTermsByVersion(second.version)).not.toHaveProperty(
      'id',
    )
    await rejects(terms.publishTerms({ ...first, content: second.content }))
    expect(await terms.getTermsByVersion(first.version)).toEqual(first)
  })
})

beforeEach(() =>
  database.run(
    'DELETE FROM email_outbox; DELETE FROM orders; DELETE FROM users; DELETE FROM terms_documents',
  ),
)
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
  const publication = {
    version: 'v1',
    content: { en: 'English', hu: 'Magyar' },
    publishedAt: '2026-10-14T10:00:00.000Z',
  }
  const acceptance = {
    version: 'v1',
    acceptedAt: '2026-10-14T10:00:00Z',
    statement: 'Accepted',
    language: 'en' as const,
  }

  it('deletes unused versions and selects the newest remaining publication', async () => {
    await terms.publishTerms(publication)
    await terms.publishTerms({ ...publication, version: 'v2' })
    expect(await terms.deleteUnusedTerms('missing')).toBe(false)
    expect(await terms.deleteUnusedTerms('v2')).toBe(true)
    expect((await terms.getCurrentTerms())?.version).toBe('v1')
    expect(await terms.getTermsByVersion('v2')).toBeNull()
    expect(await terms.deleteUnusedTerms('v1')).toBe(true)
    expect(await terms.getCurrentTerms()).toBeNull()
  })

  it('protects acceptance even after cancellation or soft deletion of the order', async () => {
    await terms.publishTerms(publication)
    await orders.createCheckoutOrder({
      ...draft,
      paymentId: 'pi_used',
      paymentStatus: 'requires_payment_method',
    })
    await orders.recordTermsAcceptance('pi_used', acceptance)
    await sqlite
      .update(ordersTable)
      .set({ paymentStatus: 'canceled', deletedAt: new Date() })

    expect(await terms.getTermsHistory()).toEqual([
      { version: 'v1', publishedAt: publication.publishedAt, canDelete: false },
    ])
    expect(await terms.deleteUnusedTerms('v1')).toBe(false)
    expect(await terms.getTermsByVersion('v1')).not.toBeNull()
  })

  it.each([false, true])(
    'never leaves acceptance referencing a deleted document, delete first: %s',
    async (deleteFirst) => {
      await terms.publishTerms(publication)
      await orders.createCheckoutOrder({
        ...draft,
        paymentId: 'pi_race',
        paymentStatus: 'requires_payment_method',
      })
      const remove = () => terms.deleteUnusedTerms('v1')
      const accept = () => orders.recordTermsAcceptance('pi_race', acceptance)
      await Promise.all(
        deleteFirst ? [remove(), accept()] : [accept(), remove()],
      )
      const order = await orders.getOrder('pi_race')
      const document = await terms.getTermsByVersion('v1')

      expect(Boolean(order?.termsAcceptance)).toBe(Boolean(document))
    },
  )

  it('records terms once and preserves the first acceptance across concurrent retries', async () => {
    await terms.publishTerms({
      version: 'v1',
      content: { en: 'English', hu: 'Magyar' },
      publishedAt: '2026-10-14T10:00:00.000Z',
    })
    await orders.createCheckoutOrder({
      ...draft,
      paymentId: 'pi_terms',
      paymentStatus: 'requires_payment_method',
    })
    const acceptance = {
      version: 'v1',
      acceptedAt: '2026-10-14T10:00:00Z',
      statement: 'Accepted terms',
      language: 'en' as const,
    }
    const results = await Promise.all([
      orders.recordTermsAcceptance('pi_terms', acceptance),
      orders.recordTermsAcceptance('pi_terms', {
        ...acceptance,
        acceptedAt: '2026-10-14T10:05:00Z',
      }),
    ])

    expect(results[0]?.termsAcceptance).toEqual(acceptance)
    expect(results[1]?.termsAcceptance).toEqual(acceptance)
    expect((await orders.getOrder('pi_terms'))?.termsAcceptance).toEqual(
      acceptance,
    )
    expect(orderUpdateSchema.parse({ termsAcceptance: acceptance })).toEqual({})
  })

  it('does not add acceptance after payment or cancellation', async () => {
    const acceptance = {
      version: 'v1',
      acceptedAt: new Date().toISOString(),
      statement: 'Accepted terms',
      language: 'en' as const,
    }

    for (const paymentStatus of [
      'processing',
      'succeeded',
      'canceled',
    ] as const) {
      const paymentId = `pi_${paymentStatus}`
      await orders.createCheckoutOrder({
        ...draft,
        paymentId,
        checkoutRequestId: paymentId,
        paymentStatus,
      })

      expect(
        (await orders.recordTermsAcceptance(paymentId, acceptance))
          ?.termsAcceptance,
      ).toBeNull()
    }
  })

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

    if (!created) {
      throw new Error('Expected draft')
    }

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

describe('SQLite order soft deletion', () => {
  it('soft deletes and restores existing orders without removing checkout or customer access', async () => {
    const order = await orders.createCheckoutOrder({
      ...draft,
      paymentId: 'pi_deleted',
      email: 'reader@example.com',
    })

    if (!order) {
      throw new Error('Expected order')
    }

    expect(await orders.setOrdersDeleted([order.id, 999999], true)).toBe(1)
    const deleted = await orders.getOrder('pi_deleted')

    if (!deleted) {
      throw new Error('Expected deleted order')
    }

    expect(deleted?.deletedAt).toBeInstanceOf(Date)
    expect(deleted?.total).toBe(order.total)
    expect(await orders.getOrderById(order.id)).toEqual(deleted)
    expect(
      await orders.getOrderByCheckoutRequestId(draft.checkoutRequestId),
    ).toEqual(deleted)
    expect(await orders.getOrdersByEmail('reader@example.com')).toEqual([
      deleted,
    ])
    expect(await orders.getAllOrders()).toEqual([deleted])
    expect(await orders.setOrdersDeleted([order.id], true)).toBe(0)
    expect((await orders.getOrderById(order.id))?.deletedAt).toEqual(
      deleted?.deletedAt,
    )
    expect(await sqlite.select().from(emailOutboxTable)).toHaveLength(0)

    expect(await orders.setOrdersDeleted([order.id], false)).toBe(1)
    expect(await orders.setOrdersDeleted([order.id], false)).toBe(0)
    expect((await orders.getOrderById(order.id))?.deletedAt).toBeNull()
    expect(await orders.getOrdersByEmail('reader@example.com')).toHaveLength(1)
  })

  it('keeps a deleted draft linkable, payable and eligible for reconciliation', async () => {
    const order = await orders.createCheckoutOrder(draft)

    if (!order) {
      throw new Error('Expected draft')
    }

    await orders.setOrdersDeleted([order.id], true)
    const linked = await orders.linkPaymentIntent(
      order.id,
      'pi_deleted_draft',
      'processing',
    )

    if (!linked) {
      throw new Error('Expected linked order')
    }

    const paid = await orders.updateOrderIfUnchanged(
      'pi_deleted_draft',
      linked,
      {
        paymentStatus: 'succeeded',
        paidAt: new Date(),
      },
    )

    expect(paid?.paidAt).toBeInstanceOf(Date)
    expect(paid?.deletedAt).toEqual(linked.deletedAt)
    expect(await sqlite.select().from(emailOutboxTable)).toHaveLength(1)
    const future = new Date(Date.now() + 60_000)
    const candidates = await orders.getOrdersForReconciliation({
      staleBefore: future,
      checkedBefore: future,
      failedCheckedBefore: future,
      terminalCheckedBefore: future,
      limit: 100,
    })

    expect(candidates.map((candidate) => candidate.id)).toContain(order.id)
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

    for (const state of states) {
      await orders.createCheckoutOrder({
        ...draft,
        ...state,
        lastReconciliationAttemptAt: state.lastReconciledAt ?? null,
      })
    }

    const query = {
      staleBefore: new Date(now - 5 * 60_000),
      checkedBefore: new Date(now - 30 * 60_000),
      failedCheckedBefore: new Date(now - 5 * 60_000),
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

    if (!created) {
      throw new Error('Expected draft')
    }

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

    if (!created) {
      throw new Error('Expected draft')
    }

    const attemptedAt = new Date(now)

    await orders.markOrderReconciliationAttempted(created.id, attemptedAt)
    const current = await orders.getOrderById(created.id)

    expect(current?.lastReconciliationAttemptAt).toEqual(attemptedAt)
    expect(current?.lastReconciledAt).toBeNull()
    // Ignore updatedAt here to exercise the separate retry-pacing predicate.
    const query = {
      staleBefore: new Date(now + 60_000),
      checkedBefore: new Date(now - 30 * 60_000),
      failedCheckedBefore: new Date(now - 5 * 60_000),
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

    if (!created) {
      throw new Error('Expected draft')
    }

    const initial = await orders.linkPaymentIntent(
      created.id,
      'pi_test',
      'processing',
    )

    if (!initial) {
      throw new Error('Expected linked order')
    }

    const repaired = await orders.updateOrderIfUnchanged('pi_test', initial, {
      paymentStatus: 'requires_payment_method',
      lastReconciledAt: new Date(),
    })

    expect(repaired?.paymentStatus).toBe('requires_payment_method')
    expect(
      await orders.updateOrderIfUnchanged('pi_test', initial, {
        paymentStatus: 'requires_action',
        lastStripeEventCreated: 100,
        lastStripeEventId: 'evt_stale',
      }),
    ).toBeNull()

    if (!repaired) {
      throw new Error('Expected reconciled order')
    }

    const paid = await orders.updateOrderIfUnchanged('pi_test', repaired, {
      paymentStatus: 'succeeded',
      paidAt: new Date(),
      lastStripeEventCreated: 101,
      lastStripeEventId: 'evt_paid',
    })

    expect(paid?.paidAt).toBeInstanceOf(Date)
    expect(
      await orders.updateOrderIfUnchanged('pi_test', repaired, {
        paymentStatus: 'succeeded',
        paidAt: new Date(),
        lastReconciledAt: new Date(),
      }),
    ).toEqual(null)
  })

  it('guards same-second edits to the total and email, not just updatedAt', async () => {
    const created = await orders.createCheckoutOrder(draft)

    if (!created) {
      throw new Error('Expected draft')
    }

    const order = await orders.linkPaymentIntent(
      created.id,
      'pi_test',
      'processing',
    )

    if (!order) {
      throw new Error('Expected linked order')
    }

    await sqlite
      .update(ordersTable)
      .set({ total: 99, email: 'new@example.com', updatedAt: order.updatedAt })
      .where(eq(ordersTable.id, order.id))
    expect(
      await orders.updateOrderIfUnchanged('pi_test', order, {
        paymentStatus: 'succeeded',
        paidAt: new Date(),
      }),
    ).toEqual(null)
  })
})

const outbox = await import('@/repositories/drizzle/outbox.repo')

describe('SQLite CMS email outbox', () => {
  const now = new Date('2026-10-07T12:00:00Z')
  const payload = {
    type: 'verification' as const,
    toAddress: 'Reader+test@example.com',
    toName: 'Reader',
    tokenLink: 'https://example.com/verify?token=private',
  }

  it('matches the exact payment ID for both admin and customer emails while excluding account emails', async () => {
    const confirmation = {
      type: 'orderConfirmation' as const,
      toAddress: payload.toAddress,
      toName: 'Reader',
      order: {
        paymentId: 'pi_test',
        total: 10,
        currency: 'USD',
        shipping: null,
        items: [],
      },
    }
    const admin = {
      type: 'adminPaymentNotification' as const,
      notificationType: AdminNotification.New,
      toAddress: 'admin@example.com',
      emailTitle: 'Created',
      customerName: 'Reader',
      customerEmail: payload.toAddress,
      items: [],
      shippingAddress: '',
      paymentId: 'pi_test',
      total: 10,
      currency: 'USD',
      paymentStatus: 'processing',
    }

    await sqlite.insert(emailOutboxTable).values([
      {
        id: 'admin',
        payload: admin,
        availableAt: now,
        deliveryStatus: 'failed',
      },
      {
        id: 'customer',
        payload: confirmation,
        availableAt: now,
        deliveryStatus: 'sent',
      },
      {
        id: 'similar-admin',
        payload: { ...admin, paymentId: 'pi_test_extra' },
        availableAt: now,
      },
      {
        id: 'similar-customer',
        payload: {
          ...confirmation,
          order: { ...confirmation.order, paymentId: 'pi_test_extra' },
        },
        availableAt: now,
      },
      { id: 'account', payload, availableAt: now },
    ])
    const result = await outbox.getEmailOutbox(
      { page: 1, limit: 25, paymentId: 'pi_test' },
      now,
    )

    expect(result.total).toBe(2)
    expect(result.entries.map((entry) => entry.id).sort()).toEqual([
      'admin',
      'customer',
    ])
    expect(
      (
        await outbox.getEmailOutbox(
          { page: 1, limit: 1, paymentId: 'pi_test' },
          now,
        )
      ).total,
    ).toBe(2)
    expect(
      (
        await outbox.getEmailOutbox(
          {
            page: 1,
            limit: 25,
            paymentId: 'pi_test',
            status: 'sent',
            search: 'Reader',
          },
          now,
        )
      ).entries.map((entry) => entry.id),
    ).toEqual(['customer'])
    expect(
      (
        await outbox.getEmailOutbox(
          {
            page: 1,
            limit: 25,
            paymentId: 'pi_test',
            type: 'adminPaymentNotification',
          },
          now,
        )
      ).entries.map((entry) => entry.id),
    ).toEqual(['admin'])
    expect(
      (
        await outbox.getEmailOutbox(
          { page: 1, limit: 25, paymentId: 'pi_test', search: 'pi_test_extra' },
          now,
        )
      ).total,
    ).toBe(0)
  })

  it('filters every status consistently with the response mapper and paginates newest first', async () => {
    const cases: (typeof emailOutboxTable.$inferInsert)[] = [
      { id: 'pending', payload, availableAt: now },
      {
        id: 'scheduled',
        payload,
        availableAt: new Date(now.getTime() + 60_000),
      },
      {
        id: 'publishing',
        payload,
        availableAt: now,
        lockedUntil: new Date(now.getTime() + 60_000),
      },
      { id: 'processed', payload, availableAt: now, processedAt: now },
      {
        id: 'relay-retry',
        payload,
        availableAt: now,
        lastError: 'Email publication failed',
      },
      ...(
        ['queued', 'sending', 'retrying', 'sent', 'skipped', 'failed'] as const
      ).map((status) => ({
        id: status,
        payload,
        availableAt: now,
        deliveryStatus: status,
      })),
    ]

    await sqlite.insert(emailOutboxTable).values(
      cases.map((entry, index) => ({
        ...entry,
        createdAt: new Date(now.getTime() + index),
      })),
    )

    for (const status of [
      'pending',
      'scheduled',
      'publishing',
      'processed',
      'queued',
      'sending',
      'retrying',
      'sent',
      'skipped',
      'failed',
    ] as const) {
      const result = await outbox.getEmailOutbox(
        { page: 1, limit: 25, status },
        now,
      )

      expect(result.total).toBe(status === 'retrying' ? 2 : 1)
      expect(
        result.entries.every(
          (entry) => emailOutboxResponse(entry, now).status === status,
        ),
      ).toBe(true)
    }

    const page = await outbox.getEmailOutbox({ page: 2, limit: 2 }, now)

    expect(page.total).toBe(11)
    expect(page.entries.map((entry) => entry.id)).toEqual(['sent', 'retrying'])
    expect(
      (await outbox.getEmailOutbox({ page: 100, limit: 2 }, now)).entries,
    ).toEqual([])
  })

  it('combines type and literal case-insensitive recipient/payment searches', async () => {
    await sqlite.insert(emailOutboxTable).values([
      { id: 'account', payload, availableAt: now },
      {
        id: 'payment',
        payload: {
          type: 'adminPaymentNotification',
          notificationType: AdminNotification.New,
          toAddress: 'admin@example.com',
          emailTitle: 'Created',
          customerName: 'Reader',
          customerEmail: 'reader@example.com',
          items: [],
          shippingAddress: '',
          paymentId: 'pi_ABC%_',
          total: 10,
          currency: 'USD',
          paymentStatus: 'processing',
        },
        availableAt: now,
      },
    ])
    expect(
      (
        await outbox.getEmailOutbox(
          { page: 1, limit: 25, search: 'READER+test' },
          now,
        )
      ).entries.map((entry) => entry.id),
    ).toEqual(['account'])
    expect(
      (
        await outbox.getEmailOutbox(
          {
            page: 1,
            limit: 25,
            type: 'adminPaymentNotification',
            search: 'abc%_',
          },
          now,
        )
      ).entries.map((entry) => entry.id),
    ).toEqual(['payment'])
    expect(
      (await outbox.getEmailOutbox({ page: 1, limit: 25, search: '%' }, now))
        .total,
    ).toBe(1)
    expect(
      (
        await outbox.getEmailOutbox(
          { page: 1, limit: 25, type: 'verification', search: 'pi_ABC' },
          now,
        )
      ).total,
    ).toBe(0)
  })

  it('preserves a fast worker outcome when the relay subsequently acknowledges publication', async () => {
    await sqlite
      .insert(emailOutboxTable)
      .values({ id: 'fast', payload, availableAt: now })
    await outbox.claimEmail(now, 'lease')
    await outbox.updateEmailDelivery('fast', {
      status: 'sent',
      attempts: 1,
      nextAttemptAt: null,
      error: null,
    })
    await outbox.completeEmail('fast', 'lease')

    const [entry] = await sqlite.select().from(emailOutboxTable)

    expect(entry).toMatchObject({
      deliveryStatus: 'sent',
      deliveryAttempts: 1,
      leaseToken: null,
    })
    expect(entry?.processedAt).toBeInstanceOf(Date)
  })
})

describe('SQLite transactional email outbox', () => {
  it('keeps linking silent and commits first-paid emails only once', async () => {
    const draftOrder = await orders.createCheckoutOrder({
      ...draft,
      email: 'guest@example.com',
    })

    if (!draftOrder) {
      throw new Error('Expected draft')
    }

    const linked = await orders.linkPaymentIntent(
      draftOrder.id,
      'pi_atomic',
      'processing',
    )

    await orders.linkPaymentIntent(draftOrder.id, 'pi_atomic', 'processing')
    expect(await sqlite.select().from(emailOutboxTable)).toHaveLength(0)

    if (!linked) {
      throw new Error('Expected linked order')
    }

    await orders.updateOrderIfUnchanged('pi_atomic', linked, {
      paymentStatus: 'succeeded',
      paidAt: new Date(),
    })
    const saved = await orders.getOrder('pi_atomic')

    if (!saved) {
      throw new Error('Expected paid order')
    }

    await orders.updateOrderIfUnchanged('pi_atomic', saved, {
      paymentStatus: 'succeeded',
    })
    expect(await sqlite.select().from(emailOutboxTable)).toHaveLength(2)
    expect(saved.paidAt).toBeInstanceOf(Date)
  })

  it('rolls back a first-paid transition when its email intent cannot be saved', async () => {
    const created = await orders.createCheckoutOrder(draft)

    if (!created) {
      throw new Error('Expected draft')
    }

    const order = await orders.linkPaymentIntent(
      created.id,
      'pi_rollback',
      'processing',
    )

    if (!order) {
      throw new Error('Expected linked order')
    }

    database.run(
      "CREATE TRIGGER reject_email BEFORE INSERT ON email_outbox BEGIN SELECT RAISE(ABORT, 'Outbox unavailable'); END",
    )

    try {
      await rejects(
        orders.updateOrderIfUnchanged('pi_rollback', order, {
          paymentStatus: 'succeeded',
          paidAt: new Date(),
        }),
        /Outbox unavailable/,
      )
      expect((await orders.getOrder('pi_rollback'))?.paidAt).toBeNull()
      expect((await orders.getOrder('pi_rollback'))?.paymentStatus).toBe(
        'processing',
      )
    } finally {
      database.run('DROP TRIGGER reject_email')
    }
  })

  it('skips customer confirmation for guests who did not supply an email', async () => {
    const created = await orders.createCheckoutOrder(draft)

    if (!created) {
      throw new Error('Expected draft')
    }

    const order = await orders.linkPaymentIntent(
      created.id,
      'pi_no_email',
      'processing',
    )

    if (!order) {
      throw new Error('Expected linked order')
    }

    await orders.updateOrderIfUnchanged('pi_no_email', order, {
      paymentStatus: 'succeeded',
      paidAt: new Date(),
    })
    expect(
      (await sqlite.select().from(emailOutboxTable)).map(
        (entry) => entry.payload.type,
      ),
    ).toEqual(['adminPaymentNotification'])
  })

  it('reclaims expired leases and refuses completion by an old publisher', async () => {
    await sqlite.insert(emailOutboxTable).values({
      id: 'lease-email',
      availableAt: new Date(),
      payload: {
        type: 'verification',
        toAddress: 'reader@example.com',
        toName: 'Reader',
        tokenLink: 'https://bookshop.test/?token=private',
      },
    })
    const [entry] = await sqlite.select().from(emailOutboxTable)

    if (!entry) {
      throw new Error('Expected pending email')
    }

    const now = entry.availableAt

    expect(
      await outbox.claimEmail(new Date(now.getTime() - 1), 'publisher-1'),
    ).toBeNull()
    expect((await outbox.claimEmail(now, 'publisher-1'))?.attempts).toBe(1)
    expect(await outbox.claimEmail(now, 'publisher-2')).toBeNull()
    expect(
      (await outbox.claimEmail(new Date(now.getTime() + 61_000), 'publisher-2'))
        ?.attempts,
    ).toBe(2)
    await outbox.completeEmail(entry.id, 'publisher-1')
    expect(
      (await sqlite.select().from(emailOutboxTable))[0]?.processedAt,
    ).toBeNull()
    await outbox.completeEmail(entry.id, 'publisher-2')
    expect(
      (await sqlite.select().from(emailOutboxTable))[0]?.processedAt,
    ).toBeInstanceOf(Date)
  })
})

describe('SQLite order reconciliation alerts', () => {
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 8, 12, minutes))
  const reason = 'Stripe payment amount or currency differs from the order'

  async function fail(orderId: number, minutes: number) {
    const order = await orders.getOrderById(orderId)

    if (!order) {
      throw new Error('Expected order')
    }

    await orders.markOrderReconciliationAttempted(orderId, at(minutes))
    await orders.recordReconciliationFailure(order, reason, at(minutes))
  }

  it('alerts after three failures, deduplicates until recovery, and allows a fresh alert', async () => {
    const order = await orders.createCheckoutOrder(draft)

    if (!order) {
      throw new Error('Expected order')
    }

    await fail(order.id, 0)
    await fail(order.id, 10)
    expect(await sqlite.select().from(emailOutboxTable)).toHaveLength(0)
    await fail(order.id, 20)
    await fail(order.id, 30)
    const first = await orders.getOrderById(order.id)
    let emails = await sqlite.select().from(emailOutboxTable)

    expect(first?.reconciliationFailures).toBe(4)
    expect(first?.reconciliationAlertId).toBeString()
    expect(emails).toHaveLength(1)
    expect(emails[0]?.payload).toMatchObject({
      notificationType: 'error',
      reconciliation: {
        alertId: first?.reconciliationAlertId,
        orderId: order.id,
        reason,
        failures: 3,
      },
    })

    await orders.markUnlinkedOrderReconciled(order.id, at(31))
    expect(await orders.getOrderById(order.id)).toMatchObject({
      reconciliationFailures: 0,
      reconciliationAlertId: null,
      lastReconciledAt: at(31),
    })

    for (const minute of [40, 50, 60]) {
      await fail(order.id, minute)
    }

    emails = await sqlite.select().from(emailOutboxTable)
    expect(emails).toHaveLength(2)
    expect(emails[0]?.id).not.toBe(emails[1]?.id)
    expect(
      (await orders.getOrderById(order.id))?.reconciliationAlertId,
    ).not.toBe(first?.reconciliationAlertId)
  })

  it('ignores duplicate, superseded, and recovered attempts', async () => {
    const order = await orders.createCheckoutOrder(draft)

    if (!order) {
      throw new Error('Expected order')
    }

    await orders.recordReconciliationFailure(order, reason, at(0))
    expect((await orders.getOrderById(order.id))?.reconciliationFailures).toBe(
      0,
    )
    await orders.markOrderReconciliationAttempted(order.id, at(0))
    await orders.recordReconciliationFailure(order, reason, at(0))
    await orders.recordReconciliationFailure(order, reason, at(0))
    expect((await orders.getOrderById(order.id))?.reconciliationFailures).toBe(
      1,
    )

    const failed = await orders.getOrderById(order.id)

    if (!failed) {
      throw new Error('Expected failed order')
    }

    await orders.markOrderReconciliationAttempted(order.id, at(10))
    await orders.recordReconciliationFailure(failed, reason, at(0))
    expect((await orders.getOrderById(order.id))?.reconciliationFailures).toBe(
      1,
    )
    await orders.markUnlinkedOrderReconciled(order.id, at(11))
    await orders.recordReconciliationFailure(failed, reason, at(10))
    expect((await orders.getOrderById(order.id))?.reconciliationFailures).toBe(
      0,
    )
    expect(await sqlite.select().from(emailOutboxTable)).toHaveLength(0)
  })

  it('rolls back the failure count and alert ID when the outbox insert fails', async () => {
    const order = await orders.createCheckoutOrder(draft)

    if (!order) {
      throw new Error('Expected order')
    }

    await fail(order.id, 0)
    await fail(order.id, 10)
    database.run(
      "CREATE TRIGGER reject_email BEFORE INSERT ON email_outbox BEGIN SELECT RAISE(ABORT, 'Outbox unavailable'); END",
    )

    try {
      await rejects(fail(order.id, 20), /Outbox unavailable/)
      expect(await orders.getOrderById(order.id)).toMatchObject({
        reconciliationFailures: 2,
        reconciliationAlertId: null,
      })
      expect(await sqlite.select().from(emailOutboxTable)).toHaveLength(0)
    } finally {
      database.run('DROP TRIGGER reject_email')
    }

    await fail(order.id, 30)
    expect(await sqlite.select().from(emailOutboxTable)).toHaveLength(1)
  })

  it('retains failures when a draft is linked and can alert on an already paid order', async () => {
    const order = await orders.createCheckoutOrder(draft)

    if (!order) {
      throw new Error('Expected order')
    }

    await fail(order.id, 0)
    await fail(order.id, 10)
    const linked = await orders.linkPaymentIntent(
      order.id,
      'pi_failed',
      'processing',
    )

    if (!linked) {
      throw new Error('Expected linked order')
    }

    await orders.updateOrderIfUnchanged('pi_failed', linked, {
      paymentStatus: 'succeeded',
      paidAt: at(11),
    })
    await fail(order.id, 20)
    const emails = await sqlite.select().from(emailOutboxTable)
    const errors = emails.filter(
      (entry) =>
        entry.payload.type === 'adminPaymentNotification' &&
        entry.payload.notificationType === AdminNotification.Error,
    )

    expect(errors).toHaveLength(1)
    expect(errors[0]?.payload).toMatchObject({
      paymentId: 'pi_failed',
      paymentStatus: 'succeeded',
      reconciliation: { reason, failures: 3 },
    })
  })

  it('retries failed paid audits sooner than routine pending checks or daily audits', async () => {
    const now = Date.now()
    const old = new Date(now - 60 * 60_000)
    const earlier = new Date(now - 10 * 60_000)
    const recent = new Date(now - 60_000)

    for (const [checkoutRequestId, attemptAt, failures] of [
      ['failed-due', earlier, 1],
      ['failed-not-due', recent, 1],
      ['routine-not-due', earlier, 0],
    ] as const) {
      await orders.createCheckoutOrder({
        ...draft,
        checkoutRequestId,
        paymentStatus: 'succeeded',
        paidAt: old,
        updatedAt: old,
        lastReconciledAt: earlier,
        lastReconciliationAttemptAt: attemptAt,
        reconciliationFailures: failures,
      })
    }

    const candidates = await orders.getOrdersForReconciliation({
      staleBefore: new Date(now - 5 * 60_000),
      checkedBefore: new Date(now - 30 * 60_000),
      failedCheckedBefore: new Date(now - 5 * 60_000),
      terminalCheckedBefore: new Date(now - 24 * 60 * 60_000),
      limit: 100,
    })

    expect(candidates.map((order) => order.checkoutRequestId)).toEqual([
      'failed-due',
    ])
  })
})

const users = await import('@/repositories/drizzle/users.repo')

describe('SQLite transactional account emails', () => {
  const user: UserRegistrationInsert = {
    uuid: 'user-atomic',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    country: 'HU',
    password: 'hash',
    role: UserRole.User,
    verified: false,
    verificationToken: 'verification-token',
    verificationExpires: new Date(Date.now() + 86_400_000),
    passwordResetToken: null,
    passwordResetExpires: null,
    address: null,
    phone: null,
    avatar: null,
  }
  it('commits registration and reset messages alongside their tokens', async () => {
    await users.createUserWithVerification(user)
    expect(
      (await users.getActiveUserBy('uuid', user.uuid))?.verificationToken,
    ).toBe('verification-token')
    const [verification] = await sqlite.select().from(emailOutboxTable)

    expect(verification?.payload).toEqual({
      type: 'verification',
      toAddress: user.email,
      toName: user.firstName,
      tokenLink: `${env.clientBaseUrl}/verification?token=verification-token`,
    })

    // The reset intent must use the saved profile, not the service's old snapshot.
    await users.updateUserBy('uuid', user.uuid, {
      firstName: 'Updated',
      email: 'updated@example.com',
    })
    const expiresAt = new Date('2030-01-01T00:00:00Z')

    await users.setPasswordResetToken(user.uuid, {
      token: 'reset-token',
      expiresAt,
    })
    expect(
      (await users.getActiveUserBy('uuid', user.uuid))?.passwordResetToken,
    ).toBe('reset-token')
    expect(await sqlite.select().from(emailOutboxTable)).toHaveLength(2)
    const reset = (await sqlite.select().from(emailOutboxTable)).find(
      (entry) => entry.payload.type === 'passwordReset',
    )

    expect(reset?.payload).toEqual({
      type: 'passwordReset',
      toAddress: 'updated@example.com',
      toName: 'Updated',
      tokenLink: `${env.clientBaseUrl}/password-reset?token=reset-token`,
    })
    expect(
      (await users.getActiveUserBy('uuid', user.uuid))?.passwordResetExpires,
    ).toEqual(expiresAt)
  })
  it('rolls back registration and reset tokens when an intent cannot be saved', async () => {
    database.run(
      "CREATE TRIGGER reject_email BEFORE INSERT ON email_outbox BEGIN SELECT RAISE(ABORT, 'Outbox unavailable'); END",
    )

    try {
      await rejects(
        users.createUserWithVerification(user),
        /Outbox unavailable/,
      )
      expect(await users.getActiveUserBy('uuid', user.uuid)).toBeNull()
      await users.createUser(user)
      await rejects(
        users.setPasswordResetToken(user.uuid, {
          token: 'reset-token',
          expiresAt: new Date(Date.now() + 60_000),
        }),
        /Outbox unavailable/,
      )
      expect(
        (await users.getActiveUserBy('uuid', user.uuid))?.passwordResetToken,
      ).toBeNull()
      expect(
        (await users.getActiveUserBy('uuid', user.uuid))?.passwordResetExpires,
      ).toBeNull()
      expect(await sqlite.select().from(emailOutboxTable)).toHaveLength(0)
    } finally {
      database.run('DROP TRIGGER reject_email')
    }
  })

  it('does not create emails for generic user writes', async () => {
    await users.createUser(user)
    await users.updateUserBy('uuid', user.uuid, { firstName: 'Updated' })

    expect(await sqlite.select().from(emailOutboxTable)).toHaveLength(0)
  })

  it('does not create an intent when the reset recipient no longer exists', async () => {
    expect(
      await users.setPasswordResetToken('missing-user', {
        token: 'reset-token',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).toBeNull()
    expect(await sqlite.select().from(emailOutboxTable)).toHaveLength(0)
  })

  it('consumes verification and reset tokens exactly once', async () => {
    await users.createUser(user)

    expect(await users.verifyUserByToken(user.verificationToken)).toMatchObject(
      {
        verified: true,
        verificationToken: null,
        verificationExpires: null,
      },
    )
    expect(await users.verifyUserByToken(user.verificationToken)).toBeNull()

    await users.setPasswordResetToken(user.uuid, {
      token: 'reset-token',
      expiresAt: new Date(Date.now() + 60_000),
    })
    expect(
      await users.resetPasswordByToken('reset-token', 'new-hash'),
    ).toMatchObject({
      password: 'new-hash',
      passwordResetToken: null,
      passwordResetExpires: null,
    })
    expect(
      await users.resetPasswordByToken('reset-token', 'replayed-hash'),
    ).toBeNull()
    expect((await users.getActiveUserBy('uuid', user.uuid))?.password).toBe(
      'new-hash',
    )
  })

  it.each(['expired', 'missing expiry', 'replaced', 'deleted'])(
    'rejects %s verification and reset tokens without changing the account',
    async (reason) => {
      const expiresAt =
        reason === 'expired'
          ? new Date(0)
          : reason === 'missing expiry'
            ? null
            : new Date(Date.now() + 60_000)
      const saved = await users.createUser({
        ...user,
        verificationToken:
          reason === 'replaced'
            ? 'new-verification-token'
            : user.verificationToken,
        verificationExpires: expiresAt,
        passwordResetToken:
          reason === 'replaced' ? 'new-reset-token' : 'reset-token',
        passwordResetExpires: expiresAt,
        deletedAt: reason === 'deleted' ? new Date() : null,
      })

      if (!saved) {
        throw new Error('Expected saved user')
      }

      expect(await users.verifyUserByToken(user.verificationToken)).toBeNull()
      expect(
        await users.resetPasswordByToken('reset-token', 'changed-hash'),
      ).toBeNull()
      expect((await users.getAllUsers())[0]).toEqual(saved)
    },
  )

  it('soft deletes users without removing their identity or orders, then restores access', async () => {
    const saved = await users.createUser({ ...user, verified: true })

    if (!saved) {
      throw new Error('Expected saved user')
    }

    const order = await orders.createCheckoutOrder({
      ...draft,
      email: saved.email,
    })

    if (!order) {
      throw new Error('Expected saved order')
    }

    expect(await users.emailExists(saved.email)).toBe(true)
    expect(await users.emailExists('missing@example.com')).toBe(false)
    expect(await users.setUsersDeleted([saved.id, 999999], true)).toBe(1)
    const [deleted] = await users.getAllUsers()

    if (!deleted) {
      throw new Error('Expected retained user')
    }

    expect(deleted?.deletedAt).toBeInstanceOf(Date)
    expect(await users.emailExists(saved.email)).toBe(true)
    expect((await users.getAllUsers())[0]).toEqual(deleted)
    for (const [field, value] of [
      ['uuid', saved.uuid],
      ['email', saved.email],
      ['id', saved.id],
      ['verificationToken', saved.verificationToken!],
    ] as const) {
      expect(await users.getActiveUserBy(field, value)).toBeNull()
    }

    expect(
      await users.updateUserBy('uuid', saved.uuid, { firstName: 'Changed' }),
    ).toBeNull()
    expect(
      await users.setPasswordResetToken(saved.uuid, {
        token: 'new-reset',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).toBeNull()
    expect(await sqlite.select().from(emailOutboxTable)).toHaveLength(0)
    expect(await orders.getOrdersByEmail(saved.email)).toEqual([order])
    await rejects(
      users.createUser({ ...user, uuid: 'new-identity' }),
      /UNIQUE constraint failed/,
    )

    expect(await users.setUsersDeleted([saved.id], true)).toBe(0)
    expect((await users.getAllUsers())[0]?.deletedAt).toEqual(
      deleted?.deletedAt,
    )
    expect(await users.setUsersDeleted([saved.id], false)).toBe(1)
    expect(await users.setUsersDeleted([saved.id], false)).toBe(0)
    expect(await users.getActiveUserBy('uuid', saved.uuid)).toEqual({
      ...deleted,
      updatedAt: expect.any(Date) as Date,
      deletedAt: null,
    })
  })

  it('returns cleanup identities and leaves pending and verified accounts alone', async () => {
    const past = new Date(Date.now() - 60_000)
    const future = new Date(Date.now() + 60_000)

    const expiredUser = await users.createUser({
      ...user,
      verificationExpires: past,
      passwordResetToken: 'old-token',
      passwordResetExpires: past,
    })
    await users.createUser({
      ...user,
      uuid: 'active-user',
      email: 'active@example.com',
      verificationExpires: future,
      passwordResetToken: 'active-token',
      passwordResetExpires: future,
    })

    await users.createUser({
      ...user,
      uuid: 'verified-user',
      email: 'verified@example.com',
      verified: true,
      verificationExpires: past,
    })

    if (!expiredUser) {
      throw new Error('Expected expired user')
    }

    expect(await users.cleanupExpiredPasswordResetTokens()).toBe(1)
    expect(
      (await users.getActiveUserBy('uuid', user.uuid))?.passwordResetToken,
    ).toBeNull()
    expect(
      (await users.getActiveUserBy('uuid', 'active-user'))?.passwordResetToken,
    ).toBe('active-token')
    expect(await users.cleanupExpiredPasswordResetTokens()).toBe(0)
    expect(await users.cleanupUnverifiedUsers()).toEqual([
      { id: expiredUser.id, email: expiredUser.email },
    ])
    expect(await users.getActiveUserBy('uuid', user.uuid)).toBeNull()
    expect(await users.getActiveUserBy('uuid', 'active-user')).not.toBeNull()
    expect(await users.getActiveUserBy('uuid', 'verified-user')).not.toBeNull()
    expect(
      (await users.getAllUsers()).find(
        (savedUser) => savedUser.uuid === user.uuid,
      )?.deletedAt,
    ).toBeInstanceOf(Date)
    expect(await users.getAllUsers()).toHaveLength(3)
    expect(await users.cleanupUnverifiedUsers()).toEqual([])
  })
})
