import { beforeEach, describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { profileUpdateSchema } from '@/validation/userSchemas'
import { BadRequest, Internal, NotFound, Unauthorized } from '@/errors'
import { errorHandler } from '@/errors/errorHandler'
import {
  AuthErrorCode,
  TermsErrorCode,
  UserErrorCode,
  ValidationRule,
} from '@/types/enums'
import { mockLogger } from './test-setup'

function expectNoLogs() {
  for (const logger of Object.values(mockLogger)) {
    expect(logger).not.toHaveBeenCalled()
  }
}

describe('central HTTP error handling', () => {
  beforeEach(() => {
    mockLogger.debug.mockClear()
    mockLogger.info.mockClear()
    mockLogger.warn.mockClear()
    mockLogger.error.mockClear()
  })

  it('returns a stable domain code without exposing the diagnostic message', async () => {
    const app = new Hono().onError((error, c) => errorHandler(c, error))
    app.get('/', () => {
      throw new BadRequest(
        'Private account details',
        UserErrorCode.EmailAlreadyExists,
      )
    })

    const response = await app.request('/')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ code: 'EMAIL_ALREADY_EXISTS' })
    expectNoLogs()
  })

  it.each([400, 401, 403, 404, 408, 409, 413, 429, 500, 503, 504] as const)(
    'codes middleware HTTP %s failures without forwarding their message',
    async (status) => {
      const app = new Hono().onError((error, c) => errorHandler(c, error))
      app.get('/', () => {
        throw new HTTPException(status, { message: 'Technical details' })
      })

      const response = await app.request('/')
      const expected = {
        400: 'BAD_REQUEST',
        401: 'UNAUTHORIZED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        408: 'REQUEST_TIMEOUT',
        409: 'BAD_REQUEST',
        413: 'PAYLOAD_TOO_LARGE',
        429: 'RATE_LIMITED',
        500: 'INTERNAL_ERROR',
        503: 'INTERNAL_ERROR',
        504: 'REQUEST_TIMEOUT',
      }

      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ code: expected[status] })

      if (status >= 500) {
        expect(mockLogger.error).toHaveBeenCalledOnce()
        expect(mockLogger.warn).not.toHaveBeenCalled()
      } else {
        expectNoLogs()
      }
    },
  )

  it.each([
    {
      name: 'a rejected JWT',
      error: new HTTPException(401, { message: 'Private token details' }),
      code: 'UNAUTHORIZED',
    },
    {
      name: 'incorrect login credentials',
      error: new Unauthorized(
        'Private login details',
        AuthErrorCode.InvalidCredentials,
      ),
      code: 'INVALID_CREDENTIALS',
    },
    {
      name: 'an invalid account token',
      error: new Unauthorized(
        'Private account details',
        AuthErrorCode.InvalidToken,
      ),
      code: 'INVALID_TOKEN',
    },
  ])(
    'returns the public code for $name without logging',
    async ({ error, code }) => {
      const app = new Hono().onError((error, c) => errorHandler(c, error))
      app.get('/', () => {
        throw error
      })

      const response = await app.request('/?token=private-token', {
        headers: {
          authorization: 'Bearer private-token',
          cookie: 'private-cookie',
        },
      })

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ code })
      expectNoLogs()
    },
  )

  it.each([
    {
      error: new Internal('Private database failure', {
        cause: new Error('Private database connection details'),
      }),
      code: 'INTERNAL_ERROR',
      status: 500,
    },
    {
      error: new BadRequest(
        'Private terms failure',
        TermsErrorCode.Unavailable,
        503,
      ),
      code: 'TERMS_UNAVAILABLE',
      status: 503,
    },
  ])(
    'logs handled HTTP $status failures once at error level',
    async ({ error, code, status }) => {
      const app = new Hono().onError((error, c) => errorHandler(c, error))
      app.get('/', () => {
        throw error
      })

      const response = await app.request('/')

      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ code })
      expect(mockLogger.error).toHaveBeenCalledOnce()
      expect(mockLogger.error).toHaveBeenCalledWith('Request failed', {
        error,
        code,
        status,
        request: { path: '/', method: 'GET', ip: 'unknown' },
      })
      expect(error.stack).toBeTruthy()
      expect(mockLogger.warn).not.toHaveBeenCalled()
      expect(mockLogger.debug).not.toHaveBeenCalled()
      expect(mockLogger.info).not.toHaveBeenCalled()
    },
  )

  it.each([
    new Error('Private exception'),
    new SyntaxError('Private syntax failure'),
    'Private rejection',
    null,
  ])(
    'maps unexpected failures to a generic 500 and logs the diagnostic once: %s',
    async (error) => {
      const app = new Hono().get('/', (c) => errorHandler(c, error))
      const response = await app.request('/')

      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ code: 'INTERNAL_ERROR' })
      expect(mockLogger.error).toHaveBeenCalledOnce()
      expect(mockLogger.error).toHaveBeenCalledWith('Request failed', {
        error: error instanceof Error ? error : String(error),
        code: 'INTERNAL_ERROR',
        status: 500,
        request: { path: '/', method: 'GET', ip: 'unknown' },
      })
      expect(mockLogger.warn).not.toHaveBeenCalled()
    },
  )

  it('serializes validation paths and bounds without messages or submitted values', async () => {
    const app = new Hono().onError((error, c) => errorHandler(c, error))
    const schema = z.object({
      email: z.email(),
      password: z.string().min(6),
      items: z.array(z.object({ quantity: z.number().max(10) })),
    })
    app.post('/', async (c) =>
      c.json(schema.parse(await c.req.json(), { reportInput: true })),
    )
    const response = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'private-address',
        password: 'secret'.slice(0, 3),
        items: [{ quantity: 12 }],
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      validation: [
        {
          path: ['email'],
          code: 'invalid_format',
          origin: 'string',
          format: 'email',
        },
        {
          path: ['password'],
          code: 'too_small',
          origin: 'string',
          minimum: 6,
          inclusive: true,
        },
        {
          path: ['items', 0, 'quantity'],
          code: 'too_big',
          origin: 'number',
          maximum: 10,
          inclusive: true,
        },
      ],
    })
    expectNoLogs()
  })

  it('preserves a custom validation code for the current password requirement', async () => {
    const app = new Hono().onError((error, c) => errorHandler(c, error))
    app.get('/', (c) =>
      c.json(profileUpdateSchema.parse({ password: 'password1' })),
    )

    const response = await app.request('/')

    expect(await response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      validation: [
        {
          path: ['currentPassword'],
          code: 'custom',
          params: { rule: 'CURRENT_PASSWORD_REQUIRED' },
        },
      ],
    })
  })

  it('keeps custom rule metadata while stripping private custom parameters', async () => {
    const app = new Hono().onError((error, c) => errorHandler(c, error))
    const schema = z.object({
      rating: z.number().refine(() => false, {
        message: 'Private validation details',
        params: {
          rule: ValidationRule.Decimal,
          token: 'Private token',
          details: { password: 'Private password' },
        },
      }),
    })
    app.get('/', (c) =>
      c.json(schema.parse({ rating: 3.14 }, { reportInput: true })),
    )

    const response = await app.request('/')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      validation: [
        { path: ['rating'], code: 'custom', params: { rule: 'DECIMAL' } },
      ],
    })
  })

  it('converts bigint bounds into JSON numbers', async () => {
    const app = new Hono().onError((error, c) => errorHandler(c, error))
    app.get('/', (c) => c.json(z.bigint().min(3n).parse(1n)))

    const response = await app.request('/')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      validation: [
        {
          path: [],
          code: 'too_small',
          origin: 'bigint',
          minimum: 3,
          inclusive: true,
        },
      ],
    })
  })

  it('returns a JSON 404 for known domain errors', async () => {
    const app = new Hono().onError((error, c) => errorHandler(c, error))

    app.get('/', () => {
      throw new NotFound('Order not found')
    })
    const response = await app.request('/')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ code: 'NOT_FOUND' })
    expectNoLogs()
  })

  it('returns a 400 for malformed JSON', async () => {
    const app = new Hono().onError((error, c) => errorHandler(c, error))

    app.post('/', async (c) => c.json(await c.req.json()))
    const response = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ code: 'INVALID_JSON' })
    expectNoLogs()
  })

  it('does not log authorization headers or token-bearing query strings', async () => {
    const app = new Hono().onError((error, c) => errorHandler(c, error))

    app.get('/', () => {
      throw new Error('Unexpected failure')
    })
    await app.request('/?token=private-token', {
      headers: {
        authorization: 'Bearer private-token',
        cookie: 'private-cookie',
      },
    })
    const log = JSON.stringify(mockLogger.error.mock.calls)

    expect(mockLogger.error).toHaveBeenCalledOnce()
    expect(log).not.toContain('private-token')
    expect(log).not.toContain('private-cookie')
  })
})
