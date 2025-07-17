import { z } from 'zod'

export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  return schema.parse(data)
}
