import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { env } from '@/config'
import { defaultTermsStatements } from '@/constants/defaults'
import { terminalStatuses } from '@/constants/payment'
import {
  type Order,
  type OrderPaymentSnapshot,
  type UserRegistrationInsert,
  UserRole,
} from '@/types'

const query = {
  sort: mock(),
  limit: mock(),
  session: mock(),
  lean: mock(),
  exec: mock(),
}
const session = { id: 'transaction-session' }
const EmailOutboxModel = {
  insertMany: mock(() => Promise.resolve()),
  updateOne: mock(),
  aggregate: mock(),
  updateMany: mock(),
}
const OrderModel = {
  find: mock(),
  findOne: mock(),
  findOneAndUpdate: mock(),
  updateOne: mock(),
  updateMany: mock(),
  db: {
    transaction: async <T>(
      fn: (transactionSession: typeof session) => Promise<T>,
    ) => fn(session),
  },
}
const UserModel = {
  create: mock(),
  exists: mock(),
  find: mock(),
  findOne: mock(),
  findOneAndUpdate: mock(),
  updateMany: mock(),
  db: OrderModel.db,
}

const TermsDocumentModel = { findOne: mock(), create: mock() }
await mock.module('@/models/mongo/TermsDocumentModel', () => ({
  TermsDocumentModel,
}))

await mock.module('@/models/mongo', () => ({
  OrderModel,
  UserModel,
  EmailOutboxModel,
}))
await mock.module('@/models/mongo/EmailOutboxModel', () => ({
  EmailOutboxModel,
}))
const orders = await import('@/repositories/mongoose/orders.repo')
const users = await import('@/repositories/mongoose/users.repo')
const outbox = await import('@/repositories/mongoose/outbox.repo')
const terms = await import('@/repositories/mongoose/terms.repo')

describe('Mongo terms documents', () => {
  const document = {
    version: '11111111-1111-4111-8111-111111111111',
    content: { en: 'English', hu: 'Magyar' },
    statements: defaultTermsStatements,
    publishedAt: '2026-10-14T10:00:00.000Z',
  }

  beforeEach(() => {
    query.sort.mockReset().mockReturnValue(query)
    query.lean.mockReset().mockReturnValue(query)
    query.exec.mockReset()
    query.exec.mockResolvedValue({
      ...document,
      publishedAt: new Date(document.publishedAt),
      _id: 'internal',
      id: 12,
    })
    TermsDocumentModel.findOne.mockReset().mockReturnValue(query)
    TermsDocumentModel.create.mockReset()
    TermsDocumentModel.create.mockResolvedValue({
      toObject: () => ({
        ...document,
        publishedAt: new Date(document.publishedAt),
        _id: 'internal',
        id: 12,
      }),
    })
  })

  it('reads the latest revision and omits database fields', async () => {
    expect(await terms.getCurrentTerms()).toEqual(document)
    expect(query.sort).toHaveBeenCalledWith({ id: -1 })
    expect(await terms.getTermsByVersion(document.version)).toEqual(document)
    expect(TermsDocumentModel.findOne).toHaveBeenLastCalledWith({
      version: document.version,
    })
  })

  it('publishes by appending an immutable document', async () => {
    expect(await terms.publishTerms(document)).toEqual(document)
    expect(TermsDocumentModel.create).toHaveBeenCalledWith({
      ...document,
      publishedAt: new Date(document.publishedAt),
    })
  })
})

describe('Mongo checkout terms acceptance', () => {
  beforeEach(() => {
    query.lean.mockReset().mockReturnValue(query)
    query.exec.mockReset()
    OrderModel.findOneAndUpdate.mockReset().mockReturnValue(query)
    OrderModel.findOne.mockReset().mockReturnValue(query)
  })

  it('atomically records acceptance only for an active, unpaid order without prior acceptance', async () => {
    const acceptance = {
      version: 'v1',
      acceptedAt: new Date().toISOString(),
      statement: 'Accepted terms',
      language: 'en' as const,
    }
    query.exec.mockResolvedValueOnce({ termsAcceptance: acceptance })

    expect(
      (await orders.recordTermsAcceptance('pi_terms', acceptance))
        ?.termsAcceptance,
    ).toEqual(acceptance)
    expect(OrderModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        paymentId: 'pi_terms',
        termsAcceptance: null,
        deletedAt: null,
        paymentStatus: {
          $in: ['requires_payment_method', 'requires_confirmation'],
        },
      },
      { $set: { termsAcceptance: acceptance } },
      { returnDocument: 'after' },
    )
  })

  it('returns the existing acceptance when another request won the update', async () => {
    const acceptance = {
      version: 'v1',
      acceptedAt: '2026-10-14T10:00:00Z',
      statement: 'Accepted terms',
      language: 'en' as const,
    }
    query.exec
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ termsAcceptance: acceptance })

    expect(
      (
        await orders.recordTermsAcceptance('pi_terms', {
          ...acceptance,
          acceptedAt: '2026-10-14T10:05:00Z',
        })
      )?.termsAcceptance,
    ).toEqual(acceptance)
  })
})

describe('Mongo order soft deletion', () => {
  beforeEach(() => {
    query.exec.mockReset().mockResolvedValue({ modifiedCount: 2 })
    OrderModel.updateMany.mockReset().mockReturnValue(query)
  })

  it('updates only active rows when soft deleting and returns the affected count', async () => {
    expect(await orders.setOrdersDeleted([1, 2, 999999], true)).toBe(2)
    expect(OrderModel.updateMany).toHaveBeenCalledWith(
      { id: { $in: [1, 2, 999999] }, deletedAt: null },
      { $set: { deletedAt: expect.any(Date) as Date } },
    )
    query.exec.mockResolvedValueOnce({ modifiedCount: 0 })
    expect(await orders.setOrdersDeleted([1, 2], true)).toBe(0)
  })

  it('restores deleted rows without changing payment fields', async () => {
    expect(await orders.setOrdersDeleted([1, 2], false)).toBe(2)
    expect(OrderModel.updateMany).toHaveBeenCalledWith(
      { id: { $in: [1, 2] }, deletedAt: { $ne: null } },
      { $set: { deletedAt: null } },
    )
  })
})

describe('Mongo CMS email outbox', () => {
  beforeEach(() => {
    query.exec.mockReset()
    EmailOutboxModel.updateOne.mockReset().mockReturnValue(query)
    EmailOutboxModel.updateMany.mockReset().mockReturnValue(query)
    EmailOutboxModel.aggregate.mockReset().mockReturnValue(query)
  })

  it('combines exact admin/customer payment matching with other filters', async () => {
    query.exec.mockResolvedValueOnce([{ entries: [], count: [] }])
    await outbox.getEmailOutbox(
      {
        page: 1,
        limit: 25,
        paymentId: 'pi_test',
        status: 'sent',
        search: 'reader',
      },
      new Date(),
    )
    const pipeline = EmailOutboxModel.aggregate.mock.calls[0]?.[0] as unknown[]

    expect(pipeline[1]).toEqual({
      $match: {
        $and: [
          {
            $or: [
              { 'payload.paymentId': 'pi_test' },
              { 'payload.order.paymentId': 'pi_test' },
            ],
          },
        ],
        status: 'sent',
        $or: [
          'payload.toAddress',
          'payload.paymentId',
          'payload.order.paymentId',
        ].map((field) => ({ [field]: { $regex: 'reader', $options: 'i' } })),
      },
    })
  })

  it('filters before a paginated facet and escapes search syntax', async () => {
    query.exec.mockResolvedValueOnce([
      { entries: [{ id: 'entry' }], count: [{ total: 26 }] },
    ])
    const now = new Date()
    const result = await outbox.getEmailOutbox(
      {
        page: 2,
        limit: 25,
        status: 'sent',
        type: 'verification',
        search: 'a+b[.]',
      },
      now,
    )
    const pipeline = EmailOutboxModel.aggregate.mock.calls[0]?.[0] as unknown[]

    expect(result.entries.map((entry) => entry.id)).toEqual(['entry'])
    expect(result.total).toBe(26)
    expect(pipeline[1]).toEqual({
      $match: {
        status: 'sent',
        'payload.type': 'verification',
        $or: [
          'payload.toAddress',
          'payload.paymentId',
          'payload.order.paymentId',
        ].map((field) => ({
          [field]: { $regex: 'a\\+b\\[\\.\\]', $options: 'i' },
        })),
      },
    })
    expect(pipeline[2]).toEqual({
      $facet: {
        entries: [
          { $sort: { createdAt: -1, id: -1 } },
          { $skip: 25 },
          { $limit: 25 },
        ],
        count: [{ $count: 'total' }],
      },
    })
  })

  it('returns zero for an empty result', async () => {
    query.exec.mockResolvedValueOnce([{ entries: [], count: [] }])
    expect(
      await outbox.getEmailOutbox({ page: 1, limit: 25 }, new Date()),
    ).toEqual({ entries: [], total: 0 })
  })

  it('acknowledges with a pipeline that preserves an existing worker status', async () => {
    query.exec.mockResolvedValueOnce(undefined)
    await outbox.completeEmail('job', 'lease')
    expect(EmailOutboxModel.updateOne).toHaveBeenCalledWith(
      { id: 'job', leaseToken: 'lease' },
      [
        {
          $set: {
            processedAt: expect.any(Date) as Date,
            deliveryStatus: { $ifNull: ['$deliveryStatus', 'queued'] },
            lockedUntil: null,
            leaseToken: null,
            lastError: null,
          },
        },
      ],
      { updatePipeline: true },
    )
  })

  it('records delivery updates without replacing payloads', async () => {
    const nextAttemptAt = new Date()

    await outbox.updateEmailDelivery('job', {
      status: 'retrying',
      attempts: 2,
      nextAttemptAt,
      error: 'Email delivery failed',
    })
    expect(EmailOutboxModel.updateOne).toHaveBeenCalledWith(
      { id: 'job' },
      {
        $set: {
          deliveryStatus: 'retrying',
          deliveryAttempts: 2,
          deliveryUpdatedAt: expect.any(Date) as Date,
          deliveryNextAttemptAt: nextAttemptAt,
          deliveryError: 'Email delivery failed',
        },
      },
    )
  })
})

describe('Mongo account cleanup', () => {
  beforeEach(() => {
    query.lean.mockReset().mockReturnValue(query)
    query.exec.mockReset()
    UserModel.find.mockReset().mockReturnValue(query)
    UserModel.updateMany.mockReset().mockReturnValue(query)
  })

  it('returns the modified count without fetching account records', async () => {
    const exec = mock(() => Promise.resolve({ modifiedCount: 3 }))

    UserModel.updateMany.mockReset().mockReturnValue({ exec })

    expect(await users.cleanupExpiredPasswordResetTokens()).toBe(3)
    expect(UserModel.updateMany).toHaveBeenCalledWith(
      { passwordResetExpires: { $lt: expect.any(Date) as Date } },
      { $unset: { passwordResetToken: 1, passwordResetExpires: 1 } },
    )
    expect(exec).toHaveBeenCalledTimes(1)
  })

  it('returns only identities from the committed soft deletion', async () => {
    query.exec
      .mockResolvedValueOnce([
        {
          id: 7,
          email: 'expired@example.com',
          password: 'private-hash',
          verificationToken: 'private-token',
          _id: 'internal-id',
        },
        { id: 8, email: 'another-expired@example.com' },
      ])
      .mockResolvedValueOnce({ modifiedCount: 2 })

    expect(await users.cleanupUnverifiedUsers()).toEqual([
      { id: 7, email: 'expired@example.com' },
      { id: 8, email: 'another-expired@example.com' },
    ])
    expect(UserModel.find).toHaveBeenCalledWith(
      {
        verified: false,
        verificationExpires: { $lt: expect.any(Date) as Date },
        deletedAt: null,
      },
      { id: 1, email: 1, _id: 0 },
      { session },
    )
    expect(UserModel.updateMany).toHaveBeenCalledWith(
      {
        verified: false,
        verificationExpires: { $lt: expect.any(Date) as Date },
        deletedAt: null,
        id: { $in: [7, 8] },
      },
      { $set: { deletedAt: expect.any(Date) as Date } },
      { session },
    )
    expect(query.exec).toHaveBeenCalledTimes(2)
  })

  it('returns no identities and skips the update when no accounts expired', async () => {
    query.exec.mockResolvedValueOnce([])

    expect(await users.cleanupUnverifiedUsers()).toEqual([])
    expect(UserModel.updateMany).not.toHaveBeenCalled()
  })

  it('propagates a write failure so identities are not reported as deleted', async () => {
    query.exec
      .mockResolvedValueOnce([{ id: 7, email: 'expired@example.com' }])
      .mockRejectedValueOnce(new Error('Cleanup write failed'))

    await rejects(users.cleanupUnverifiedUsers(), /Cleanup write failed/)
  })

  it('aborts if the update count differs from the selected identities', async () => {
    query.exec
      .mockResolvedValueOnce([{ id: 7, email: 'expired@example.com' }])
      .mockResolvedValueOnce({ modifiedCount: 0 })

    await rejects(
      users.cleanupUnverifiedUsers(),
      /unexpected number of accounts/,
    )
  })
})

describe('Mongo reconciliation queries', () => {
  beforeEach(() => {
    for (const method of Object.values(query)) {
      method.mockReset()
    }

    for (const method of [
      OrderModel.find,
      OrderModel.findOneAndUpdate,
      OrderModel.updateOne,
      EmailOutboxModel.insertMany,
    ]) {
      method.mockReset()
    }

    query.sort.mockReturnValue(query)
    query.limit.mockReturnValue(query)
    query.lean.mockReturnValue(query)
    query.session.mockReturnValue(query)
    query.exec.mockResolvedValue([])
    OrderModel.find.mockReturnValue(query)
    OrderModel.findOneAndUpdate.mockReturnValue(query)
    OrderModel.updateOne.mockReturnValue(query)
  })

  it('matches SQLite eligibility and oldest-check-first batch ordering', async () => {
    const cutoffs = {
      staleBefore: new Date('2026-10-05T10:00:00Z'),
      checkedBefore: new Date('2026-10-05T09:35:00Z'),
      failedCheckedBefore: new Date('2026-10-05T10:00:00Z'),
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
            {
              reconciliationFailures: { $gt: 0 },
              lastReconciliationAttemptAt: { $lt: cutoffs.failedCheckedBefore },
            },
          ],
        },
      ],
      $or: [
        { reconciliationFailures: { $gt: 0 } },
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
    ).toBeNull()
    expect(OrderModel.findOneAndUpdate).toHaveBeenCalledWith(
      { paymentId: 'pi_test', ...snapshot },
      fields,
      { returnDocument: 'after', session },
    )
    query.exec.mockResolvedValueOnce({
      ...snapshot,
      ...fields,
      paymentId: 'pi_test',
      items: [],
      shipping: null,
    })
    expect(
      (await orders.updateOrderIfUnchanged('pi_test', snapshot, fields))
        ?.paidAt,
    ).toEqual(fields.paidAt)
    expect(EmailOutboxModel.insertMany).toHaveBeenCalledWith(
      expect.any(Array),
      { session },
    )
  })

  it('propagates an outbox failure so the Mongo transaction is aborted', async () => {
    const snapshot: OrderPaymentSnapshot = {
      id: 1,
      paymentStatus: 'processing',
      total: 10,
      currency: 'USD',
      email: null,
      updatedAt: new Date(),
      lastStripeEventId: null,
      lastStripeEventCreated: null,
      lastReconciledAt: null,
      paidAt: null,
    }
    const fields = { paymentStatus: 'succeeded' as const, paidAt: new Date() }

    query.exec.mockResolvedValueOnce({
      ...snapshot,
      ...fields,
      paymentId: 'pi_test',
      items: [],
      shipping: null,
    })
    EmailOutboxModel.insertMany.mockRejectedValueOnce(
      new Error('Outbox unavailable'),
    )
    await rejects(
      orders.updateOrderIfUnchanged('pi_test', snapshot, fields),
      /Outbox unavailable/,
    )
    expect(EmailOutboxModel.insertMany).toHaveBeenCalledWith(
      expect.any(Array),
      { session },
    )
  })

  it('only stamps drafts that are still unlinked', async () => {
    const checkedAt = new Date()

    await orders.markUnlinkedOrderReconciled(1, checkedAt)
    expect(OrderModel.updateOne).toHaveBeenCalledWith(
      { id: 1, paymentId: null },
      {
        lastReconciledAt: checkedAt,
        reconciliationFailures: 0,
        reconciliationAlertId: null,
      },
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

describe('Mongo order reconciliation alerts', () => {
  const attemptedAt = new Date('2026-10-08T12:20:00Z')
  const reason = 'Stripe payment amount or currency differs from the order'
  const current: Order = {
    id: 1,
    checkoutRequestId: 'checkout-failed',
    termsAcceptance: null,
    createdAt: new Date('2026-10-08T11:00:00Z'),
    updatedAt: new Date('2026-10-08T11:00:00Z'),
    lastStripeEventCreated: null,
    lastStripeEventId: null,
    lastReconciliationAttemptAt: attemptedAt,
    lastReconciledAt: null,
    paidAt: new Date('2026-10-08T11:00:00Z'),
    firstName: null,
    lastName: null,
    email: null,
    shipping: null,
    paymentId: 'pi_failed',
    total: 12.34,
    currency: 'USD',
    paymentStatus: 'succeeded' as const,
    items: [],
    reconciliationFailures: 2,
    reconciliationAlertId: null,
    deletedAt: null,
  }
  const filter = {
    id: current.id,
    reconciliationFailures: current.reconciliationFailures,
    lastReconciliationAttemptAt: attemptedAt,
    $or: [
      { lastReconciledAt: null },
      { lastReconciledAt: { $lt: attemptedAt } },
    ],
  }

  beforeEach(() => {
    query.session.mockReset().mockReturnValue(query)
    query.lean.mockReset().mockReturnValue(query)
    query.exec.mockReset()
    OrderModel.findOne.mockReset().mockReturnValue(query)
    OrderModel.updateOne.mockReset().mockReturnValue(query)
    EmailOutboxModel.insertMany.mockReset().mockResolvedValue(undefined)
  })

  it('commits the guarded failure update and alert using the same session', async () => {
    query.exec.mockResolvedValueOnce(current).mockResolvedValueOnce(undefined)
    await orders.recordReconciliationFailure(current, reason, attemptedAt)

    expect(OrderModel.findOne).toHaveBeenCalledWith(filter)
    expect(query.session).toHaveBeenCalledWith(session)
    const update = OrderModel.updateOne.mock.calls[0]?.[1] as {
      reconciliationFailures: number
      reconciliationAlertId: string
    }

    expect(update.reconciliationFailures).toBe(3)
    expect(update.reconciliationAlertId).toBeString()
    expect(OrderModel.updateOne).toHaveBeenCalledWith(filter, update, {
      session,
    })
    expect(EmailOutboxModel.insertMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: `admin-error-${update.reconciliationAlertId}`,
          payload: expect.objectContaining({
            paymentStatus: 'succeeded',
            reconciliation: expect.objectContaining({
              alertId: update.reconciliationAlertId,
              orderId: current.id,
              reason,
              failures: 3,
            }) as unknown,
          }) as unknown,
        }) as unknown,
      ],
      { session },
    )
    expect(query.exec.mock.invocationCallOrder[1]).toBeLessThan(
      EmailOutboxModel.insertMany.mock.invocationCallOrder[0]!,
    )
  })

  it('does not repeat an active alert', async () => {
    const alerted = {
      ...current,
      reconciliationFailures: 3,
      reconciliationAlertId: 'alert-1',
    }

    query.exec.mockResolvedValueOnce(alerted).mockResolvedValueOnce(undefined)
    await orders.recordReconciliationFailure(alerted, reason, attemptedAt)

    expect(OrderModel.updateOne.mock.calls[0]?.[1]).toEqual({
      reconciliationFailures: 4,
      reconciliationAlertId: 'alert-1',
    })
    expect(EmailOutboxModel.insertMany).not.toHaveBeenCalled()
  })

  it('ignores duplicate or recovered checks whose guarded snapshot no longer matches', async () => {
    query.exec.mockResolvedValueOnce(null)
    await orders.recordReconciliationFailure(current, reason, attemptedAt)

    expect(OrderModel.updateOne).not.toHaveBeenCalled()
    expect(EmailOutboxModel.insertMany).not.toHaveBeenCalled()
  })

  it('propagates an outbox failure to abort the transaction', async () => {
    query.exec.mockResolvedValueOnce(current).mockResolvedValueOnce(undefined)
    EmailOutboxModel.insertMany.mockRejectedValueOnce(
      new Error('Outbox unavailable'),
    )

    await rejects(
      orders.recordReconciliationFailure(current, reason, attemptedAt),
      /Outbox unavailable/,
    )
    expect(EmailOutboxModel.insertMany).toHaveBeenCalledWith(
      expect.any(Array),
      { session },
    )
  })
})

describe('Mongo transactional account emails', () => {
  const user = {
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
  } satisfies UserRegistrationInsert
  const storedUser = {
    ...user,
    id: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }
  const reset = {
    token: 'reset-token',
    expiresAt: new Date(Date.now() + 60_000),
  }

  beforeEach(() => {
    UserModel.create.mockReset()
    UserModel.findOneAndUpdate.mockReset()
    EmailOutboxModel.insertMany.mockReset()
    EmailOutboxModel.insertMany.mockResolvedValue(undefined)
    query.lean.mockReset().mockReturnValue(query)
    query.exec.mockReset()
    UserModel.findOneAndUpdate.mockReturnValue(query)
  })

  it('creates verification mail from the saved user using the insert session', async () => {
    const savedUser = { ...storedUser, email: 'saved@example.com' }

    UserModel.create.mockResolvedValueOnce([{ toObject: () => savedUser }])

    expect(await users.createUserWithVerification(user)).toEqual(savedUser)
    expect(UserModel.create).toHaveBeenCalledWith([user], { session })
    expect(EmailOutboxModel.insertMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          payload: {
            type: 'verification',
            toAddress: savedUser.email,
            toName: savedUser.firstName,
            tokenLink: `${env.clientBaseUrl}/verification?token=verification-token`,
          },
        }),
      ],
      { session },
    )
  })

  it('creates reset mail from the updated user using the update session', async () => {
    const savedUser = {
      ...storedUser,
      firstName: 'Updated',
      email: 'updated@example.com',
      passwordResetToken: reset.token,
      passwordResetExpires: reset.expiresAt,
    }

    query.exec.mockResolvedValueOnce(savedUser)

    expect(await users.setPasswordResetToken(user.uuid, reset)).toEqual(
      savedUser,
    )
    expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith(
      { uuid: user.uuid, deletedAt: null },
      {
        passwordResetToken: reset.token,
        passwordResetExpires: reset.expiresAt,
      },
      { returnDocument: 'after', session },
    )
    expect(EmailOutboxModel.insertMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          payload: {
            type: 'passwordReset',
            toAddress: savedUser.email,
            toName: savedUser.firstName,
            tokenLink: `${env.clientBaseUrl}/password-reset?token=reset-token`,
          },
        }),
      ],
      { session },
    )
  })

  it('propagates verification intent failures to abort the transaction', async () => {
    UserModel.create.mockResolvedValueOnce([{ toObject: () => user }])
    EmailOutboxModel.insertMany.mockRejectedValueOnce(
      new Error('Outbox unavailable'),
    )

    await rejects(users.createUserWithVerification(user), /Outbox unavailable/)
    expect(EmailOutboxModel.insertMany).toHaveBeenCalledWith(
      expect.any(Array),
      { session },
    )
  })

  it('propagates reset intent failures to abort the transaction', async () => {
    query.exec.mockResolvedValueOnce({
      ...user,
      passwordResetToken: reset.token,
    })
    EmailOutboxModel.insertMany.mockRejectedValueOnce(
      new Error('Outbox unavailable'),
    )

    await rejects(
      users.setPasswordResetToken(user.uuid, reset),
      /Outbox unavailable/,
    )
    expect(EmailOutboxModel.insertMany).toHaveBeenCalledWith(
      expect.any(Array),
      { session },
    )
  })

  it('does not create an intent when no user is updated', async () => {
    query.exec.mockResolvedValueOnce(null)

    expect(await users.setPasswordResetToken('missing-user', reset)).toBeNull()
    expect(EmailOutboxModel.insertMany).not.toHaveBeenCalled()
  })

  it('does not create an intent when registration fails', async () => {
    UserModel.create.mockRejectedValueOnce(new Error('Insert failed'))

    await rejects(users.createUserWithVerification(user), /Insert failed/)
    expect(EmailOutboxModel.insertMany).not.toHaveBeenCalled()
  })

  it('verifies only the current unexpired token of an active account', async () => {
    query.exec.mockResolvedValueOnce({ ...storedUser, verified: true })

    expect(await users.verifyUserByToken('verification-token')).toMatchObject({
      verified: true,
    })
    expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        verificationToken: 'verification-token',
        verificationExpires: { $gt: expect.any(Date) as Date },
        deletedAt: null,
      },
      { verified: true, verificationToken: null, verificationExpires: null },
      { returnDocument: 'after' },
    )
  })

  it('changes a password only while its reset token is current and unexpired', async () => {
    query.exec.mockResolvedValueOnce({ ...storedUser, password: 'new-hash' })

    expect(
      await users.resetPasswordByToken('reset-token', 'new-hash'),
    ).toMatchObject({ password: 'new-hash' })
    expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        passwordResetToken: 'reset-token',
        passwordResetExpires: { $gt: expect.any(Date) as Date },
        deletedAt: null,
      },
      {
        password: 'new-hash',
        passwordResetToken: null,
        passwordResetExpires: null,
      },
      { returnDocument: 'after' },
    )
  })

  it('returns null when a token is expired, replaced, consumed, or its account is deleted', async () => {
    query.exec.mockResolvedValue(null)

    expect(await users.verifyUserByToken('unusable-token')).toBeNull()
    expect(
      await users.resetPasswordByToken('unusable-token', 'new-hash'),
    ).toBeNull()
  })

  it('keeps generic creation and updates email-free', async () => {
    UserModel.create.mockResolvedValueOnce([{ toObject: () => storedUser }])
    query.exec.mockResolvedValueOnce(storedUser)

    expect(await users.createUser(user)).toEqual(storedUser)
    expect(UserModel.create).toHaveBeenCalledWith([user], { session })
    expect(
      await users.updateUserBy('uuid', user.uuid, { firstName: 'Updated' }),
    ).toEqual(storedUser)
    expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith(
      { uuid: user.uuid, deletedAt: null },
      { firstName: 'Updated' },
      { returnDocument: 'after' },
    )
    expect(EmailOutboxModel.insertMany).not.toHaveBeenCalled()
  })
})

describe('Mongo user soft deletion', () => {
  beforeEach(() => {
    query.lean.mockReset().mockReturnValue(query)
    query.exec.mockReset()
    UserModel.findOne.mockReset().mockReturnValue(query)
    UserModel.find.mockReset().mockReturnValue(query)
    UserModel.exists.mockReset().mockReturnValue(query)
    UserModel.updateMany.mockReset().mockReturnValue(query)
  })

  it('excludes deleted users from active account lookups', async () => {
    query.exec.mockResolvedValue(null)
    expect(
      await users.getActiveUserBy('email', 'reader@example.com'),
    ).toBeNull()
    expect(UserModel.findOne).toHaveBeenLastCalledWith({
      email: 'reader@example.com',
      deletedAt: null,
    })
  })

  it.each([null, { _id: 'existing-user-id' }])(
    'checks email existence without excluding deleted users: %j',
    async (result) => {
      query.exec.mockResolvedValueOnce(result)

      expect(await users.emailExists('reader@example.com')).toBe(
        Boolean(result),
      )
      expect(UserModel.exists).toHaveBeenCalledWith({
        email: 'reader@example.com',
      })
      expect(UserModel.findOne).not.toHaveBeenCalled()
    },
  )

  it.each([true, false])(
    'changes only matching user deletion states: %s',
    async (deleted) => {
      query.exec.mockResolvedValue({ modifiedCount: 1 })
      expect(await users.setUsersDeleted([1, 999999], deleted)).toBe(1)
      expect(UserModel.updateMany).toHaveBeenCalledWith(
        { id: { $in: [1, 999999] }, deletedAt: deleted ? null : { $ne: null } },
        { $set: { deletedAt: deleted ? (expect.any(Date) as Date) : null } },
      )
      query.exec.mockResolvedValueOnce({ modifiedCount: 0 })
      expect(await users.setUsersDeleted([1], deleted)).toBe(0)
    },
  )

  it('soft deletes expired unverified accounts without touching already deleted users', async () => {
    query.exec
      .mockResolvedValueOnce([{ id: 7, email: 'expired@example.com' }])
      .mockResolvedValueOnce({ modifiedCount: 1 })
    expect(await users.cleanupUnverifiedUsers()).toEqual([
      { id: 7, email: 'expired@example.com' },
    ])
    expect(UserModel.updateMany).toHaveBeenCalledWith(
      {
        verified: false,
        verificationExpires: { $lt: expect.any(Date) as Date },
        deletedAt: null,
        id: { $in: [7] },
      },
      { $set: { deletedAt: expect.any(Date) as Date } },
      { session },
    )
  })
})
