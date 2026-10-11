import { and, asc, desc, eq, isNull, lte, or, sql } from 'drizzle-orm'
import { sqlite } from '@/db'
import { emailOutboxTable } from '@/models/sqlite/emailOutboxTable'
import {
  type EmailDeliveryUpdate,
  type EmailOutboxEntry,
  type EmailOutboxQuery,
} from '@/types'

export async function claimEmail(
  now: Date,
  leaseToken: string,
): Promise<EmailOutboxEntry | null> {
  return sqlite.transaction(
    (tx) => {
      const [candidate] = tx
        .select()
        .from(emailOutboxTable)
        .where(
          and(
            isNull(emailOutboxTable.processedAt),
            lte(emailOutboxTable.availableAt, now),
            or(
              isNull(emailOutboxTable.lockedUntil),
              lte(emailOutboxTable.lockedUntil, now),
            ),
          ),
        )
        .orderBy(
          asc(emailOutboxTable.availableAt),
          asc(emailOutboxTable.createdAt),
        )
        .limit(1)
        .all()

      if (!candidate) {
        return null
      }

      const [claimed] = tx
        .update(emailOutboxTable)
        .set({
          leaseToken,
          lockedUntil: new Date(now.getTime() + 60_000),
          attempts: sql`${emailOutboxTable.attempts} + 1`,
        })
        .where(eq(emailOutboxTable.id, candidate.id))
        .returning()
        .all()

      return claimed ?? null
    },
    { behavior: 'immediate' },
  )
}

export async function completeEmail(
  id: string,
  leaseToken: string,
): Promise<void> {
  await sqlite
    .update(emailOutboxTable)
    .set({
      processedAt: new Date(),
      deliveryStatus: sql`coalesce(${emailOutboxTable.deliveryStatus}, 'queued')`,
      lockedUntil: null,
      leaseToken: null,
      lastError: null,
    })
    .where(
      and(
        eq(emailOutboxTable.id, id),
        eq(emailOutboxTable.leaseToken, leaseToken),
      ),
    )
}

export async function retryEmail(
  id: string,
  leaseToken: string,
  availableAt: Date,
  lastError: string,
): Promise<void> {
  await sqlite
    .update(emailOutboxTable)
    .set({ availableAt, lastError, lockedUntil: null, leaseToken: null })
    .where(
      and(
        eq(emailOutboxTable.id, id),
        eq(emailOutboxTable.leaseToken, leaseToken),
      ),
    )
}

export async function updateEmailDelivery(
  id: string,
  update: EmailDeliveryUpdate,
): Promise<void> {
  await sqlite
    .update(emailOutboxTable)
    .set({
      deliveryStatus: update.status,
      deliveryAttempts: update.attempts,
      deliveryUpdatedAt: new Date(),
      deliveryNextAttemptAt: update.nextAttemptAt,
      deliveryError: update.error,
    })
    .where(eq(emailOutboxTable.id, id))
}

export async function getEmailOutbox(query: EmailOutboxQuery, now: Date) {
  const status = sql<string>`case
    when ${emailOutboxTable.deliveryStatus} is not null then ${emailOutboxTable.deliveryStatus}
    when ${emailOutboxTable.processedAt} is not null then 'processed'
    when ${emailOutboxTable.lockedUntil} > ${now.getTime()} then 'publishing'
    when ${emailOutboxTable.lastError} is not null then 'retrying'
    when ${emailOutboxTable.availableAt} > ${now.getTime()} then 'scheduled'
    else 'pending' end`
  const recipient = sql<string>`json_extract(${emailOutboxTable.payload}, '$.toAddress')`
  const paymentId = sql<string>`coalesce(json_extract(${emailOutboxTable.payload}, '$.paymentId'), json_extract(${emailOutboxTable.payload}, '$.order.paymentId'), '')`
  const filters = and(
    query.paymentId ? sql`${paymentId} = ${query.paymentId}` : undefined,
    query.type
      ? sql`json_extract(${emailOutboxTable.payload}, '$.type') = ${query.type}`
      : undefined,
    query.status ? sql`${status} = ${query.status}` : undefined,
    query.search
      ? sql`(instr(lower(${recipient}), lower(${query.search})) > 0 or instr(lower(${paymentId}), lower(${query.search})) > 0)`
      : undefined,
  )
  const entries = await sqlite
    .select()
    .from(emailOutboxTable)
    .where(filters)
    .orderBy(desc(emailOutboxTable.createdAt), desc(emailOutboxTable.id))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit)
  const [count] = await sqlite
    .select({ total: sql<number>`count(*)` })
    .from(emailOutboxTable)
    .where(filters)

  return { entries, total: count?.total ?? 0 }
}
