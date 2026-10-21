import { desc, eq } from 'drizzle-orm'
import { sqlite } from '@/db'
import { termsDocumentsTable } from '@/models/sqlite/termsDocumentsTable'
import { termsDocumentResponse } from '@/utils/terms.utils'
import type { TermsDocument, TermsDocumentInsert } from '@/types/terms.types'

export async function getCurrentTerms(): Promise<TermsDocument | null> {
  const [document] = await sqlite
    .select()
    .from(termsDocumentsTable)
    .orderBy(desc(termsDocumentsTable.id))
    .limit(1)

  return document ? termsDocumentResponse(document) : null
}

export async function getTermsByVersion(
  version: string,
): Promise<TermsDocument | null> {
  const [document] = await sqlite
    .select()
    .from(termsDocumentsTable)
    .where(eq(termsDocumentsTable.version, version))
    .limit(1)

  return document ? termsDocumentResponse(document) : null
}

export async function publishTerms(
  document: TermsDocumentInsert,
): Promise<TermsDocument> {
  const [saved] = await sqlite
    .insert(termsDocumentsTable)
    .values({
      version: document.version,
      content: document.content,
      statements: document.statements,
      publishedAt: new Date(document.publishedAt),
    })
    .returning()

  return termsDocumentResponse(saved!)
}
