import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { defaultTermsStatements } from '@/constants/defaults'
import type { TermsContent } from '@/types/terms.types'

export const termsDocumentsTable = sqliteTable('terms_documents', {
  id: int().primaryKey({ autoIncrement: true }),
  version: text().notNull().unique(),
  content: text({ mode: 'json' }).$type<TermsContent>().notNull(),
  statements: text({ mode: 'json' })
    .$type<TermsContent>()
    .notNull()
    .default(defaultTermsStatements),
  publishedAt: int('published_at', { mode: 'timestamp_ms' }).notNull(),
})
