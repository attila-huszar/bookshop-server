import { z } from 'zod/v4'

export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  return schema.parse(data)
}
