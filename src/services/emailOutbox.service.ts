import { outboxDB } from '@/repositories'
import { emailOutboxQuerySchema, validate } from '@/validation'
import { emailOutboxResponse } from '@/utils/email-outbox.utils'

export async function getEmailOutbox(query: Record<string, string>) {
  const criteria = validate(emailOutboxQuerySchema, query)
  const now = new Date()
  const result = await outboxDB.getEmailOutbox(criteria, now)

  return {
    entries: result.entries.map((entry) => emailOutboxResponse(entry, now)),
    total: result.total,
    page: criteria.page,
    limit: criteria.limit,
  }
}
