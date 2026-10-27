import { EmailOutboxModel, OrderModel } from '@/models/mongo'
import { TermsDocumentModel } from '@/models/mongo/TermsDocumentModel'
import {
  orderPaidEmails,
  orderReconciliationFailure,
} from '@/utils/email-job.utils'
import { getErrorCode } from '@/utils/error.utils'
import { terminalStatuses } from '@/constants/payment'
import { BadRequest } from '@/errors'
import type {
  CmsOrderUpdate,
  Order,
  OrderInsert,
  OrderPaymentSnapshot,
  OrderReconciliationQuery,
  OrderUpdate,
  TermsAcceptance,
} from '@/types'
import { TermsErrorCode } from '@/types/enums'

const MONGO_DUPLICATE_KEY_CODE = 11000

export async function getOrderByCheckoutRequestId(
  checkoutRequestId: string,
): Promise<Order | null> {
  return await OrderModel.findOne({ checkoutRequestId }).lean().exec()
}

export async function createCheckoutOrder(
  order: OrderInsert,
): Promise<Order | null> {
  try {
    const { id, createdAt, updatedAt, ...orderData } = order
    const created = await OrderModel.create(orderData)

    return created.toObject()
  } catch (error) {
    // Concurrent requests can race to insert the same checkout. Only recover
    // a uniqueness conflict when the winning order actually exists.
    if (getErrorCode(error) === MONGO_DUPLICATE_KEY_CODE) {
      const existing = await getOrderByCheckoutRequestId(
        order.checkoutRequestId,
      )

      if (existing) {
        return existing
      }
    }

    throw error
  }
}

export async function updateOrder(
  paymentId: string,
  fields: CmsOrderUpdate,
): Promise<Order | null> {
  return await OrderModel.findOneAndUpdate({ paymentId }, fields, {
    returnDocument: 'after',
  })
    .lean()
    .exec()
}

export async function updateOrderIfUnchanged(
  paymentId: string,
  expected: OrderPaymentSnapshot,
  fields: OrderUpdate,
): Promise<Order | null> {
  return await OrderModel.db.transaction(async (session) => {
    const updatedOrder = await OrderModel.findOneAndUpdate(
      {
        paymentId,
        id: expected.id,
        total: expected.total,
        currency: expected.currency,
        email: expected.email,
        updatedAt: expected.updatedAt,
        paymentStatus: expected.paymentStatus,
        lastStripeEventCreated: expected.lastStripeEventCreated,
        lastStripeEventId: expected.lastStripeEventId,
        lastReconciledAt: expected.lastReconciledAt,
        paidAt: expected.paidAt,
      },
      fields,
      { returnDocument: 'after', session },
    )
      .lean()
      .exec()

    const becamePaid = Boolean(
      updatedOrder && expected.paidAt === null && fields.paidAt instanceof Date,
    )

    if (updatedOrder && becamePaid) {
      await EmailOutboxModel.insertMany(orderPaidEmails(updatedOrder), {
        session,
      })
    }

    return updatedOrder ?? null
  })
}

export async function getOrder(paymentId: string): Promise<Order | null> {
  const order = await OrderModel.findOne({ paymentId }).lean().exec()

  if (!order) {
    return null
  }

  return order
}

/** Keep the first acceptance and its timestamp across identical retries. */
export async function recordTermsAcceptance(
  paymentId: string,
  acceptance: TermsAcceptance,
): Promise<Order | null> {
  return await OrderModel.db.transaction(async (session) => {
    const updated = await OrderModel.findOneAndUpdate(
      {
        paymentId,
        termsAcceptance: null,
        deletedAt: null,
        paymentStatus: {
          $in: ['requires_payment_method', 'requires_confirmation'],
        },
      },
      { $set: { termsAcceptance: acceptance } },
      { returnDocument: 'after', session },
    )
      .lean()
      .exec()

    if (updated) {
      // A real write conflicts with concurrent deletion of the accepted document.
      const reference = await TermsDocumentModel.updateOne(
        { version: acceptance.version },
        { $inc: { __v: 1 } },
        { session },
      )

      if (reference.matchedCount !== 1) {
        throw new BadRequest(
          'The terms and conditions have changed. Please review them again.',
          TermsErrorCode.Changed,
          412,
        )
      }

      return updated
    }

    return await OrderModel.findOne({ paymentId }, null, { session })
      .lean()
      .exec()
  })
}

export async function getOrderById(id: number): Promise<Order | null> {
  const order = await OrderModel.findOne({ id }).lean().exec()

  return order ?? null
}

export async function linkPaymentIntent(
  orderId: number,
  paymentId: string,
  paymentStatus: Order['paymentStatus'],
): Promise<Order | null> {
  const existingOrder = await getOrderById(orderId)

  if (!existingOrder) {
    return null
  }

  if (existingOrder.paymentId === paymentId) {
    return existingOrder
  }

  if (existingOrder.paymentId !== null) {
    return null
  }

  const linkedOrder = await OrderModel.db.transaction(async (session) => {
    const order = await OrderModel.findOneAndUpdate(
      { id: orderId, paymentId: null },
      { paymentId, paymentStatus },
      { returnDocument: 'after', session },
    )
      .lean()
      .exec()

    return order
  })

  if (linkedOrder) {
    return linkedOrder
  }

  const currentOrder = await getOrderById(orderId)

  return currentOrder?.paymentId === paymentId ? currentOrder : null
}

export async function getAllOrders(): Promise<Order[]> {
  const orders = await OrderModel.find().lean().exec()

  return orders
}

export async function getOrdersForReconciliation({
  staleBefore,
  checkedBefore,
  failedCheckedBefore,
  terminalCheckedBefore,
  limit,
}: OrderReconciliationQuery): Promise<Order[]> {
  return await OrderModel.find({
    updatedAt: { $lt: staleBefore },
    $and: [
      {
        $or: [
          { lastReconciliationAttemptAt: null },
          { lastReconciliationAttemptAt: { $lt: checkedBefore } },
          {
            reconciliationFailures: { $gt: 0 },
            lastReconciliationAttemptAt: { $lt: failedCheckedBefore },
          },
        ],
      },
    ],
    $or: [
      { reconciliationFailures: { $gt: 0 } },
      { lastReconciledAt: null },
      { lastReconciledAt: { $lt: terminalCheckedBefore } },
      {
        lastReconciledAt: { $lt: checkedBefore },
        $or: [
          { paymentStatus: { $nin: terminalStatuses } },
          { paymentStatus: 'succeeded', paidAt: null },
        ],
      },
    ],
  })
    .sort({ lastReconciliationAttemptAt: 1, id: 1 })
    .limit(limit)
    .lean()
    .exec()
}

export async function markOrderReconciliationAttempted(
  orderId: number,
  attemptedAt: Date,
): Promise<void> {
  await OrderModel.updateOne(
    { id: orderId },
    { lastReconciliationAttemptAt: attemptedAt },
  ).exec()
}

export async function markUnlinkedOrderReconciled(
  orderId: number,
  checkedAt: Date,
): Promise<void> {
  await OrderModel.updateOne(
    { id: orderId, paymentId: null },
    {
      lastReconciledAt: checkedAt,
      reconciliationFailures: 0,
      reconciliationAlertId: null,
    },
  ).exec()
}

/** Mongo operations share one session and execute sequentially. */
export async function recordReconciliationFailure(
  expected: Order,
  reason: string,
  attemptedAt: Date,
): Promise<void> {
  await OrderModel.db.transaction(async (session) => {
    const filter = {
      id: expected.id,
      reconciliationFailures: expected.reconciliationFailures,
      lastReconciliationAttemptAt: attemptedAt,
      $or: [
        { lastReconciledAt: null },
        { lastReconciledAt: { $lt: attemptedAt } },
      ],
    }
    const order = await OrderModel.findOne(filter)
      .session(session)
      .lean()
      .exec()

    if (!order) {
      return
    }

    const failure = orderReconciliationFailure(order, reason)
    await OrderModel.updateOne(filter, failure.fields, { session }).exec()

    if (failure.email) {
      await EmailOutboxModel.insertMany([failure.email], { session })
    }
  })
}

export async function getOrdersByEmail(email: string): Promise<Order[]> {
  const orders = await OrderModel.find({ email })
    .sort({ createdAt: -1 })
    .lean()
    .exec()

  return orders
}

/** Archiving changes CMS visibility; payment and customer lookups still see the row. */
export async function setOrdersDeleted(
  orderIds: number[],
  deleted: boolean,
): Promise<number> {
  const result = await OrderModel.updateMany(
    { id: { $in: orderIds }, deletedAt: deleted ? null : { $ne: null } },
    { $set: { deletedAt: deleted ? new Date() : null } },
  ).exec()

  return result.modifiedCount
}
