import { defaultTimeZone } from '@/constants/localization'
import type { TermsContent, TermsDocument } from '@/types/terms.types'

const publicationDateFormatter = new Intl.DateTimeFormat('en', {
  timeZone: defaultTimeZone,
  calendar: 'iso8601',
  numberingSystem: 'latn',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function formatTermsPublicationDate(publishedAt: string): string {
  const parts = publicationDateFormatter.formatToParts(new Date(publishedAt))

  const { year, month, day } = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  )

  return `${year}-${month}-${day}`
}

export function termsDocumentResponse(document: {
  version: string
  content: TermsContent
  publishedAt: Date
}): TermsDocument {
  return {
    version: document.version,
    content: { en: document.content.en, hu: document.content.hu },
    publishedAt: document.publishedAt.toISOString(),
  }
}
