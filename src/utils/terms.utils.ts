import type { TermsContent, TermsDocument } from '@/types/terms.types'

export function termsDocumentResponse(document: {
  version: string
  content: TermsContent
  statements: TermsContent
  publishedAt: Date
}): TermsDocument {
  return {
    version: document.version,
    content: { en: document.content.en, hu: document.content.hu },
    statements: { en: document.statements.en, hu: document.statements.hu },
    publishedAt: document.publishedAt.toISOString(),
  }
}
