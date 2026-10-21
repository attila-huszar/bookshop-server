import { z } from 'zod'

export const termsVersionSchema = z.uuid()
export const shopLanguageSchema = z.enum(['en', 'hu'])

export const publishTermsSchema = z
  .object({
    content: z
      .object({
        en: z.string().trim().min(1).max(20000),
        hu: z.string().trim().min(1).max(20000),
      })
      .strict(),
  })
  .strict()
