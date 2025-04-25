import { z } from 'zod'

export function validate<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  data: unknown,
): T {
  return schema.parse(data)
}

export function formatZodError(error: z.ZodError): string {
  return error.errors
    .map((err) => `${err.path.join('.')}: ${err.message}`)
    .join(', ')
}
