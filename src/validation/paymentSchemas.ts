import { z } from 'zod'
import { maxItemQuantity } from '@/constants'
import { shopLanguageSchema, termsVersionSchema } from './termsSchemas'

export const acceptPaymentTermsSchema = z
  .object({
    accepted: z.literal(true),
    version: termsVersionSchema,
    language: shopLanguageSchema,
  })
  .strict()

export const paymentIntentRequestSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.int().positive(),
        quantity: z.int().min(1).max(maxItemQuantity),
      }),
    )
    .min(1),
  expectedTotal: z.number().nonnegative(),
})
