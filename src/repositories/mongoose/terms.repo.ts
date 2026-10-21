import { TermsDocumentModel } from '@/models/mongo/TermsDocumentModel'
import { termsDocumentResponse } from '@/utils/terms.utils'
import type { TermsDocument, TermsDocumentInsert } from '@/types/terms.types'

export async function getCurrentTerms(): Promise<TermsDocument | null> {
  const document = await TermsDocumentModel.findOne()
    .sort({ id: -1 })
    .lean()
    .exec()

  return document ? termsDocumentResponse(document) : null
}

export async function getTermsByVersion(
  version: string,
): Promise<TermsDocument | null> {
  const document = await TermsDocumentModel.findOne({ version }).lean().exec()

  return document ? termsDocumentResponse(document) : null
}

export async function publishTerms(
  document: TermsDocumentInsert,
): Promise<TermsDocument> {
  const saved = await TermsDocumentModel.create({
    version: document.version,
    content: document.content,
    statements: document.statements,
    publishedAt: new Date(document.publishedAt),
  })

  return termsDocumentResponse(saved.toObject())
}
