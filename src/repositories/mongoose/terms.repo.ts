import { OrderModel } from '@/models/mongo'
import { TermsDocumentModel } from '@/models/mongo/TermsDocumentModel'
import { termsDocumentResponse } from '@/utils/terms.utils'
import type {
  TermsDocument,
  TermsDocumentInsert,
  TermsDocumentSummary,
} from '@/types/terms.types'

export async function getTermsHistory(): Promise<TermsDocumentSummary[]> {
  const documents = await TermsDocumentModel.find()
    .select({ version: 1, publishedAt: 1, _id: 0 })
    .sort({ id: -1 })
    .lean()
    .exec()

  const acceptedVersions = new Set(
    await OrderModel.distinct('termsAcceptance.version', {
      'termsAcceptance.version': {
        $in: documents.map((document) => document.version),
      },
    }).exec(),
  )

  return documents.map((document) => ({
    version: document.version,
    publishedAt: document.publishedAt.toISOString(),
    canDelete: !acceptedVersions.has(document.version),
  }))
}

export async function deleteUnusedTerms(version: string): Promise<boolean> {
  return await TermsDocumentModel.db.transaction(async (session) => {
    // Both deletion and first acceptance write this document, preventing write skew.
    const locked = await TermsDocumentModel.findOneAndUpdate(
      { version },
      { $inc: { __v: 1 } },
      { session, returnDocument: 'after' },
    )
      .lean()
      .exec()

    if (!locked) {
      return false
    }

    const accepted = await OrderModel.exists({
      'termsAcceptance.version': version,
    })
      .session(session)
      .exec()

    if (accepted) {
      return false
    }

    const result = await TermsDocumentModel.deleteOne({ version }, { session })

    return result.deletedCount === 1
  })
}

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
