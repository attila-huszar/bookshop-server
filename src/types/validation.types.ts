import type { z } from 'zod'
import type { publicValidationIssueSchema } from '@/validation/errorSchemas'

/** Custom validators must output values compatible with their database columns. */
export type SchemaRefinements<Row> = {
  [Field in keyof Row]?: z.ZodType<Row[Field]>
}

/**
 * Public Zod metadata selected by publicValidationIssueSchema for client translation.
 * Preserves native issue codes and custom params.rule identifiers rather than app
 * ErrorCode values. Input, message text, and nested issue payloads stay private.
 */
export type ApiValidationIssue = z.output<typeof publicValidationIssueSchema>
