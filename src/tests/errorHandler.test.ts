import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { profileUpdateSchema } from '@/validation/userSchemas'
import { BadRequest, NotFound } from '@/errors'
import { errorHandler } from '@/errors/errorHandler'
import { UserErrorCode, ValidationRule } from '@/types/enums'
import { mockLogger } from './test-setup'

describe('central HTTP error handling', () => {
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
  })

  it.each([401, 403, 404, 504] as const)(
    'codes middleware HTTP %s failures without forwarding their message',
    async (status) => {
      const app = new Hono().onError((error, c) => errorHandler(c, error))
      app.get('/', () => {
        throw new HTTPException(status, { message: 'Technical details' })
      })

      const response = await app.request('/')
      const expected = {
        401: 'UNAUTHORIZED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        504: 'REQUEST_TIMEOUT',
      }

      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ code: expected[status] })
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
  })
  it('does not log authorization headers or token-bearing query strings', async () => {
    mockLogger.error.mockClear()
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

    expect(log).not.toContain('private-token')
    expect(log).not.toContain('private-cookie')
  })
})
