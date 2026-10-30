export type ShopLanguage = 'en' | 'hu'

export type TermsContent = Record<ShopLanguage, string>

export type TermsDocument = {
  version: string
  content: TermsContent
  statements: TermsContent
  publishedAt: string
}

export type TermsDocumentSummary = Pick<
  TermsDocument,
  'version' | 'publishedAt'
> & { canDelete: boolean }

export type TermsDocumentInsert = Omit<TermsDocument, 'statements'> & {
  statements?: TermsContent
}

export type CheckoutTerms = Pick<
  TermsDocument,
  'version' | 'statements' | 'publishedAt'
> & {
  url: string
}

export type TermsAcceptance = Pick<TermsDocument, 'version'> & {
  language: ShopLanguage
  acceptedAt: string
  statement: string
}
