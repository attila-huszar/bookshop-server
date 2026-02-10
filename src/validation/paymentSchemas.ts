import { z } from 'zod'
import { maxItemQuantity } from '@/constants'

export const paymentIntentRequestSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.int().positive(),
        quantity: z.int().min(1).max(maxItemQuantity),
      }),
    )
    .min(1),
})
