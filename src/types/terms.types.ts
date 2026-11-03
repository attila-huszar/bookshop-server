import type { shopLanguages } from '@/constants/localization'

export type ShopLanguage = (typeof shopLanguages)[number]

export type TermsContent = Record<ShopLanguage, string>

export type TermsDocument = {
  version: string
  content: TermsContent
  publishedAt: string
}

export type TermsDocumentSummary = Pick<
  TermsDocument,
  'version' | 'publishedAt'
> & { canDelete: boolean }

export type CheckoutTerms = Pick<TermsDocument, 'version' | 'publishedAt'> & {
  url: string
}

export type TermsAcceptance = Pick<TermsDocument, 'version'> & {
  language: ShopLanguage
  acceptedAt: string
}
