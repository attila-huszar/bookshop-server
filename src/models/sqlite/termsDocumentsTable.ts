import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { TermsContent } from '@/types/terms.types'

export const termsDocumentsTable = sqliteTable('terms_documents', {
  id: int().primaryKey({ autoIncrement: true }),
  version: text().notNull().unique(),
  content: text({ mode: 'json' }).$type<TermsContent>().notNull(),
  publishedAt: int('published_at', { mode: 'timestamp_ms' }).notNull(),
})
