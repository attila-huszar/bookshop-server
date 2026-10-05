import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { terminalStatuses } from '@/constants/payment'
import type { OrderPaymentSnapshot } from '@/types'

const query = { sort: mock(), limit: mock(), lean: mock(), exec: mock() }
const OrderModel = { find: mock(), findOneAndUpdate: mock(), updateOne: mock() }
await mock.module('@/models', () => ({ default: { OrderModel } }))
const orders = await import('@/repositories/mongoose/orders.repo')

describe('Mongo reconciliation queries', () => {
  beforeEach(() => {
    for (const method of Object.values(query)) method.mockReset()
    for (const method of Object.values(OrderModel)) method.mockReset()
    query.sort.mockReturnValue(query)
    query.limit.mockReturnValue(query)
    query.lean.mockReturnValue(query)
    query.exec.mockResolvedValue([])
    OrderModel.find.mockReturnValue(query)
    OrderModel.findOneAndUpdate.mockReturnValue(query)
    OrderModel.updateOne.mockReturnValue(query)
  })

  it('matches SQLite eligibility and oldest-check-first batch ordering', async () => {
    const cutoffs = {
      staleBefore: new Date('2026-10-05T10:00:00Z'),
      checkedBefore: new Date('2026-10-05T09:35:00Z'),
      terminalCheckedBefore: new Date('2026-10-04T10:05:00Z'),
      limit: 100,
    }
    await orders.getOrdersForReconciliation(cutoffs)
    expect(OrderModel.find).toHaveBeenCalledWith({
      updatedAt: { $lt: cutoffs.staleBefore },
      $and: [
        {
          $or: [
            { lastReconciliationAttemptAt: null },
            { lastReconciliationAttemptAt: { $lt: cutoffs.checkedBefore } },
          ],
        },
      ],
      $or: [
        { lastReconciledAt: null },
        { lastReconciledAt: { $lt: cutoffs.terminalCheckedBefore } },
        {
          lastReconciledAt: { $lt: cutoffs.checkedBefore },
          $or: [
            { paymentStatus: { $nin: terminalStatuses } },
            { paymentStatus: 'succeeded', paidAt: null },
          ],
        },
      ],
    })
    expect(query.sort).toHaveBeenCalledWith({
      lastReconciliationAttemptAt: 1,
      id: 1,
    })
    expect(query.limit).toHaveBeenCalledWith(100)
  })

  it('requires the same payment, audit, and paid snapshot for an atomic update', async () => {
    const snapshot: OrderPaymentSnapshot = {
      id: 1,
      paymentStatus: 'processing',
      total: 12.34,
      currency: 'USD',
      email: 'guest@example.com',
      updatedAt: new Date(),
      lastStripeEventId: 'evt_previous',
      lastStripeEventCreated: 100,
      lastReconciledAt: null,
      paidAt: null,
    }
    const fields = {
      paymentStatus: 'succeeded' as const,
      paidAt: new Date(),
      lastReconciledAt: new Date(),
    }
    query.exec.mockResolvedValueOnce(null)
    expect(
      await orders.updateOrderIfUnchanged('pi_test', snapshot, fields),
    ).toEqual({ order: null, becamePaid: false })
    expect(OrderModel.findOneAndUpdate).toHaveBeenCalledWith(
      { paymentId: 'pi_test', ...snapshot },
      fields,
      { new: true },
    )
    query.exec.mockResolvedValueOnce({
      ...snapshot,
      ...fields,
      paymentId: 'pi_test',
    })
    expect(
      (await orders.updateOrderIfUnchanged('pi_test', snapshot, fields))
        .becamePaid,
    ).toBe(true)
  })

  it('only stamps drafts that are still unlinked', async () => {
    const checkedAt = new Date()
    await orders.markUnlinkedOrderReconciled(1, checkedAt)
    expect(OrderModel.updateOne).toHaveBeenCalledWith(
      { id: 1, paymentId: null },
      { lastReconciledAt: checkedAt },
    )
  })

  it('records failed attempts separately from successful reconciliation', async () => {
    const attemptedAt = new Date()
    await orders.markOrderReconciliationAttempted(1, attemptedAt)
    expect(OrderModel.updateOne).toHaveBeenCalledWith(
      { id: 1 },
      { lastReconciliationAttemptAt: attemptedAt },
    )
  })
})
