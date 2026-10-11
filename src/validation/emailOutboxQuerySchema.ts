import { z } from 'zod'
import { EMAIL, emailOutboxStatuses } from '@/constants/email'
import { idSchema, paymentIdSchema } from './commonSchemas'

export const emailOutboxQuerySchema = z
  .object({
    page: idSchema.pipe(z.number().max(10_000)).default(1),
    limit: idSchema.pipe(z.number().max(100)).default(25),
    paymentId: paymentIdSchema.max(200).optional(),
    type: z
      .enum([
        EMAIL.verification.type,
        EMAIL.passwordReset.type,
        EMAIL.orderConfirmation.type,
        EMAIL.adminPaymentNotification.type,
      ])
      .optional(),
    status: z.enum(emailOutboxStatuses).optional(),
    search: z.string().trim().max(200).optional(),
  })
  .strict()
