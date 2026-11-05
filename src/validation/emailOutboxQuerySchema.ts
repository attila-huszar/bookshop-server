import { z } from 'zod'
import { EMAIL, emailOutboxStatuses } from '@/constants/email'
import { emailOutboxPagination } from '@/constants/pagination'
import { validationLimits } from '@/constants/validation'
import { idSchema, paymentIdSchema } from './commonSchemas'

export const emailOutboxQuerySchema = z
  .object({
    page: idSchema
      .pipe(z.number().max(emailOutboxPagination.maxPage))
      .default(1),
    limit: idSchema
      .pipe(z.number().max(emailOutboxPagination.maxLimit))
      .default(emailOutboxPagination.defaultLimit),
    paymentId: paymentIdSchema
      .max(validationLimits.emailOutbox.paymentIdMaxLength)
      .optional(),
    type: z
      .enum([
        EMAIL.verification.type,
        EMAIL.passwordReset.type,
        EMAIL.orderConfirmation.type,
        EMAIL.adminPaymentNotification.type,
      ])
      .optional(),
    status: z.enum(emailOutboxStatuses).optional(),
    search: z
      .string()
      .trim()
      .max(validationLimits.emailOutbox.searchMaxLength)
      .optional(),
  })
  .strict()
