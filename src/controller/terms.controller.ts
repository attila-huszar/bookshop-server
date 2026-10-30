import { Hono } from 'hono'
import {
  getCurrentTerms,
  getCurrentTermsVersion,
  getTermsByVersion,
} from '@/services/terms.service'
import { shopLanguageSchema } from '@/validation/termsSchemas'
import { API } from '@/constants'

export const terms = new Hono()

terms.get(API.terms.root, async (c) => {
  c.header('Cache-Control', 'no-store')

  return c.json(await getCurrentTerms())
})

terms.get(API.terms.currentVersion, async (c) => {
  c.header('Cache-Control', 'no-store')

  return c.json(await getCurrentTermsVersion())
})

terms.get(API.terms.byVersion, async (c) => {
  const document = await getTermsByVersion(c.req.param('version'))
  c.header('Cache-Control', 'public, max-age=31536000, immutable')

  if (c.req.query('download') === 'true') {
    const language = shopLanguageSchema.parse(c.req.query('language') ?? 'en')
    const publishedDate = new Date(document.publishedAt).toLocaleDateString(
      'en-CA',
      { timeZone: 'Europe/Budapest' },
    )
    c.header(
      'Content-Disposition',
      `attachment; filename="terms-${publishedDate}-${language}.txt"`,
    )
    c.header('X-Content-Type-Options', 'nosniff')

    return c.text(document.content[language])
  }

  return c.json(document)
})
