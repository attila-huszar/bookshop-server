import { z } from 'zod'
import { shopLanguages } from '@/constants/localization'
import { validationLimits } from '@/constants/validation'

export const termsVersionSchema = z.uuid()
export const shopLanguageSchema = z.enum(shopLanguages)

export const publishTermsSchema = z
  .object({
    content: z
      .object({
        en: z
          .string()
          .trim()
          .min(1)
          .max(validationLimits.terms.contentMaxLength),
        hu: z
          .string()
          .trim()
          .min(1)
          .max(validationLimits.terms.contentMaxLength),
      })
      .strict(),
  })
  .strict()
