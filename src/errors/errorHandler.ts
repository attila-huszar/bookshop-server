import { type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { publicValidationIssueSchema } from '@/validation/errorSchemas'
import { log } from '@/libs'
import { HttpErrorCode } from '@/types/enums'
import type { ApiValidationIssue } from '@/types/validation.types'
import { BaseError } from './BaseError'

const httpErrorCodes: Partial<Record<number, HttpErrorCode>> = {
  401: HttpErrorCode.Unauthorized,
  403: HttpErrorCode.Forbidden,
  404: HttpErrorCode.NotFound,
  408: HttpErrorCode.Timeout,
  413: HttpErrorCode.PayloadTooLarge,
  429: HttpErrorCode.RateLimited,
  504: HttpErrorCode.Timeout,
}

/**
 * Convert request failures to coded HTTP responses and record server diagnostics.
 * Zod failures include public issue metadata for client translation; raw messages
 * and submitted input are excluded. Unexpected failures return Internal.
 */
export function errorHandler(c: Context, error: unknown) {
  const request = {
    path: c.req.path,
    method: c.req.method,
    // Never log cookies, authorization headers, or token-bearing query strings.
    ip:
      c.req.header('X-Forwarded-For') ?? c.req.header('X-Real-Ip') ?? 'unknown',
  }

  if (
    error instanceof SyntaxError &&
    c.req.header('content-type')?.includes('application/json')
  ) {
    return c.json({ code: HttpErrorCode.InvalidJson }, 400)
  }

  if (error instanceof HTTPException) {
    void log.warn(error.constructor.name, { error, request })

    const code =
      httpErrorCodes[error.status] ??
      (error.status >= 500 ? HttpErrorCode.Internal : HttpErrorCode.BadRequest)

    return c.json({ code }, error.status)
  }

  if (error instanceof BaseError) {
    void log.warn(error.constructor.name, { error, request })

    return c.json({ code: error.code }, error.status)
  }

  if (error instanceof z.ZodError) {
    void log.warn(error.constructor.name, { request })

    return c.json(
      {
        code: HttpErrorCode.Validation,
        validation: error.issues.map(toPublicValidationIssue),
      },
      400,
    )
  }

  if (error instanceof Error) {
    void log.error(error.constructor.name, { error, request })

    return c.json({ code: HttpErrorCode.Internal }, 500)
  }

  void log.error('Unknown error', { error: String(error), request })

  return c.json({ code: HttpErrorCode.Internal }, 500)
}

/** Preserve Zod's codes and metadata without exposing input or message text. */
function toPublicValidationIssue(issue: z.core.$ZodIssue): ApiValidationIssue {
  return publicValidationIssueSchema.parse(issue)
}
