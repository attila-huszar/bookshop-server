import { z } from 'zod'
import { maxOrderItems } from '@/constants'

export const paymentIntentRequestSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.int().positive(),
        quantity: z.int().min(1).max(maxOrderItems),
      }),
    )
    .min(1),
})
