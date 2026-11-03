import { Hono } from 'hono'
import { getCurrentTerms, getTermsByVersion } from '@/services/terms.service'
import { shopLanguageSchema } from '@/validation/termsSchemas'
import { formatTermsPublicationDate } from '@/utils/terms.utils'
import { API } from '@/constants'

export const terms = new Hono()

terms.get(API.terms.root, async (c) => {
  c.header('Cache-Control', 'no-store')

  return c.json(await getCurrentTerms())
})

terms.get(API.terms.byVersion, async (c) => {
  c.header('Cache-Control', 'no-store')
  const document = await getTermsByVersion(c.req.param('version'))

  if (c.req.query('download') === 'true') {
    const language = shopLanguageSchema.parse(c.req.query('language') ?? 'en')

    const publishedDate = formatTermsPublicationDate(document.publishedAt)

    c.header(
      'Content-Disposition',
      `attachment; filename="terms-${publishedDate}-${language}.txt"`,
    )
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Cache-Control', 'public, max-age=31536000, immutable')

    return c.text(document.content[language])
  }

  c.header('Cache-Control', 'public, max-age=31536000, immutable')

  return c.json(document)
})
