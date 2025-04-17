import { z } from 'zod'

export function validate<T extends z.ZodType>(
  schema: T,
  data: unknown,
): z.SafeParseReturnType<unknown, z.infer<T>> {
  return schema.safeParse(data)
}

export function formatZodError(error: z.ZodError): string {
  return error.errors
    .map((err) => `${err.path.join('.')}: ${err.message}`)
    .join(', ')
}
