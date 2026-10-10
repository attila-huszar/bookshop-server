import type { PipelineStage } from 'mongoose'
import { EmailOutboxModel } from '@/models/mongo/EmailOutboxModel'
import {
  type EmailDeliveryUpdate,
  type EmailOutboxEntry,
  type EmailOutboxQuery,
} from '@/types'

export async function claimEmail(
  now: Date,
  leaseToken: string,
): Promise<EmailOutboxEntry | null> {
  return await EmailOutboxModel.findOneAndUpdate(
    {
      processedAt: null,
      availableAt: { $lte: now },
      $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
    },
    {
      $set: { leaseToken, lockedUntil: new Date(now.getTime() + 60_000) },
      $inc: { attempts: 1 },
    },
    { returnDocument: 'after', sort: { availableAt: 1, createdAt: 1 } },
  )
    .lean()
    .exec()
}

export async function completeEmail(
  id: string,
  leaseToken: string,
): Promise<void> {
  await EmailOutboxModel.updateOne(
    { id, leaseToken },
    [
      {
        $set: {
          processedAt: new Date(),
          deliveryStatus: { $ifNull: ['$deliveryStatus', 'queued'] },
          lockedUntil: null,
          leaseToken: null,
          lastError: null,
        },
      },
    ],
    { updatePipeline: true },
  ).exec()
}

export async function retryEmail(
  id: string,
  leaseToken: string,
  availableAt: Date,
  lastError: string,
): Promise<void> {
  await EmailOutboxModel.updateOne(
    { id, leaseToken },
    { $set: { availableAt, lastError, lockedUntil: null, leaseToken: null } },
  ).exec()
}

export async function updateEmailDelivery(
  id: string,
  update: EmailDeliveryUpdate,
): Promise<void> {
  await EmailOutboxModel.updateOne(
    { id },
    {
      $set: {
        deliveryStatus: update.status,
        deliveryAttempts: update.attempts,
        deliveryUpdatedAt: new Date(),
        deliveryNextAttemptAt: update.nextAttemptAt,
        deliveryError: update.error,
      },
    },
  ).exec()
}

export async function getEmailOutbox(query: EmailOutboxQuery, now: Date) {
  const match: Record<string, unknown> = {}

  if (query.paymentId) {
    match.$and = [
      {
        $or: [
          { 'payload.paymentId': query.paymentId },
          { 'payload.order.paymentId': query.paymentId },
        ],
      },
    ]
  }

  if (query.type) {
    match['payload.type'] = query.type
  }

  if (query.status) {
    match.status = query.status
  }

  if (query.search) {
    const search = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    match.$or = [
      'payload.toAddress',
      'payload.paymentId',
      'payload.order.paymentId',
    ].map((field) => ({ [field]: { $regex: search, $options: 'i' } }))
  }

  const pipeline: PipelineStage[] = [
    {
      $set: {
        status: {
          $switch: {
            branches: [
              {
                case: { $ne: [{ $ifNull: ['$deliveryStatus', null] }, null] },
                then: '$deliveryStatus',
              },
              {
                case: { $ne: [{ $ifNull: ['$processedAt', null] }, null] },
                then: 'processed',
              },
              { case: { $gt: ['$lockedUntil', now] }, then: 'publishing' },
              {
                case: { $ne: [{ $ifNull: ['$lastError', null] }, null] },
                then: 'retrying',
              },
              { case: { $gt: ['$availableAt', now] }, then: 'scheduled' },
            ],
            default: 'pending',
          },
        },
      },
    },
    { $match: match },
    {
      $facet: {
        entries: [
          { $sort: { createdAt: -1, id: -1 } },
          { $skip: (query.page - 1) * query.limit },
          { $limit: query.limit },
        ],
        count: [{ $count: 'total' }],
      },
    },
  ]
  const [result] = await EmailOutboxModel.aggregate<{
    entries: EmailOutboxEntry[]
    count: { total: number }[]
  }>(pipeline).exec()

  return { entries: result?.entries ?? [], total: result?.count[0]?.total ?? 0 }
}
