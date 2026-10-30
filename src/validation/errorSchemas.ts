import { z } from 'zod'

const validationBoundSchema = z
  .union([z.number(), z.bigint()])
  .transform(Number)
  .pipe(z.number())
  .optional()
  .catch(undefined)

/** Unknown issue properties and custom parameters are stripped from responses. */
export const publicValidationIssueSchema = z.object({
  code: z.string(),
  path: z
    .array(z.unknown())
    .transform((path) =>
      path.filter(
        (part): part is string | number =>
          typeof part === 'string' || typeof part === 'number',
      ),
    ),
  origin: z.string().optional(),
  expected: z.string().optional(),
  format: z.string().optional(),
  minimum: validationBoundSchema,
  maximum: validationBoundSchema,
  inclusive: z.boolean().optional(),
  params: z.object({ rule: z.string() }).optional().catch(undefined),
})
