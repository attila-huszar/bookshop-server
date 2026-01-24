import { z } from 'zod'

/**
 * Normal validation — throws on invalid data
 */
export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  return schema.parse(data)
}

/**
 * Safe validation — never throws, returns null if invalid
 */
export function safeValidate<T>(schema: z.ZodType<T>, data: unknown): T | null {
  const result = schema.safeParse(data)
  if (!result.success) return null
  return result.data
}
