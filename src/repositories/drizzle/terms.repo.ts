import { and, desc, eq, notExists, sql } from 'drizzle-orm'
import { sqlite } from '@/db'
import { ordersTable } from '@/models/sqlite/ordersTable'
import { termsDocumentsTable } from '@/models/sqlite/termsDocumentsTable'
import { termsDocumentResponse } from '@/utils/terms.utils'
import type {
  TermsDocument,
  TermsDocumentInsert,
  TermsDocumentSummary,
} from '@/types/terms.types'

export async function getTermsHistory(): Promise<TermsDocumentSummary[]> {
  const documents = await sqlite
    .select({
      version: termsDocumentsTable.version,
      publishedAt: termsDocumentsTable.publishedAt,
      canDelete: sql<boolean>`not exists (
        select 1 from ${ordersTable}
        where json_extract(${ordersTable.termsAcceptance}, '$.version') = ${termsDocumentsTable.version}
      )`.mapWith(Boolean),
    })
    .from(termsDocumentsTable)
    .orderBy(desc(termsDocumentsTable.id))

  return documents.map((document) => ({
    version: document.version,
    publishedAt: document.publishedAt.toISOString(),
    canDelete: document.canDelete,
  }))
}

/** The acceptance check and delete share one SQLite write statement. */
export async function deleteUnusedTerms(version: string): Promise<boolean> {
  const deleted = await sqlite
    .delete(termsDocumentsTable)
    .where(
      and(
        eq(termsDocumentsTable.version, version),
        notExists(
          sqlite
            .select({ id: ordersTable.id })
            .from(ordersTable)
            .where(
              sql`json_extract(${ordersTable.termsAcceptance}, '$.version') = ${version}`,
            ),
        ),
      ),
    )
    .returning({ version: termsDocumentsTable.version })

  return deleted.length === 1
}

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
