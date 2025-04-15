import { z } from 'zod'
import {
  loginSchema,
  registerSchema,
  verificationSchema,
  passwordResetRequestSchema,
  passwordResetTokenSchema,
  orderItemSchema,
  orderCreateSchema,
  orderUpdateSchema,
} from './schemas'

export function validate<T extends z.ZodType>(
  schema: T,
  data: unknown,
): z.SafeParseReturnType<unknown, z.infer<T>> {
  return schema.safeParse(data)
}

export const schemas = {
  login: loginSchema,
  register: registerSchema,
  verification: verificationSchema,
  passwordResetRequest: passwordResetRequestSchema,
  passwordResetToken: passwordResetTokenSchema,
  orderItem: orderItemSchema,
  orderCreate: orderCreateSchema,
  orderUpdate: orderUpdateSchema,
}

export type SchemaType = keyof typeof schemas

export function formatZodError(error: z.ZodError): string {
  return error.errors
    .map((err) => `${err.path.join('.')}: ${err.message}`)
    .join(', ')
}
