import { type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'
import { publicValidationIssueSchema } from '@/validation/errorSchemas'
import { log } from '@/libs'
import { type ErrorCode, HttpErrorCode } from '@/types/enums'
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

type ErrorResponse = {
  status: ContentfulStatusCode
  body: {
    code: ErrorCode
    validation?: ApiValidationIssue[]
  }
}

/**
 * Expected client failures are quiet; server failures are logged once.
 * Response classification preserves public codes and sanitized validation details.
 */
export function errorHandler(c: Context, error: unknown) {
  const failure = classifyError(
    error,
    c.req.header('content-type')?.includes('application/json') ?? false,
  )

  if (failure.status >= 500) {
    void log.error('Request failed', {
      error: error instanceof Error ? error : String(error),
      code: failure.body.code,
      status: failure.status,
      request: requestContext(c),
    })
  }

  return c.json(failure.body, failure.status)
}

function classifyError(error: unknown, isJsonRequest: boolean): ErrorResponse {
  if (error instanceof SyntaxError && isJsonRequest) {
    return { status: 400, body: { code: HttpErrorCode.InvalidJson } }
  }

  if (error instanceof BaseError) {
    return { status: error.status, body: { code: error.code } }
  }

  if (error instanceof HTTPException) {
    const code =
      httpErrorCodes[error.status] ??
      (error.status >= 500 ? HttpErrorCode.Internal : HttpErrorCode.BadRequest)

    return { status: error.status, body: { code } }
  }

  if (error instanceof z.ZodError) {
    return {
      status: 400,
      body: {
        code: HttpErrorCode.Validation,
        validation: error.issues.map(toPublicValidationIssue),
      },
    }
  }

  return { status: 500, body: { code: HttpErrorCode.Internal } }
}

function requestContext(c: Context) {
  return {
    path: c.req.path,
    method: c.req.method,
    // Never log cookies, authorization headers, or token-bearing query strings.
    ip:
      c.req.header('X-Forwarded-For') ?? c.req.header('X-Real-Ip') ?? 'unknown',
  }
}

/** Preserve Zod's codes and metadata without exposing input or message text. */
function toPublicValidationIssue(issue: z.core.$ZodIssue): ApiValidationIssue {
  return publicValidationIssueSchema.parse(issue)
}
