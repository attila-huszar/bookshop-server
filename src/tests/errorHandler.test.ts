import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { NotFound } from '@/errors'
import { errorHandler } from '@/errors/errorHandler'
import { mockLogger } from './test-setup'

describe('central HTTP error handling', () => {
  it('returns a JSON 404 for known domain errors', async () => {
    const app = new Hono().onError((error, c) => errorHandler(c, error))

    app.get('/', () => {
      throw new NotFound('Order not found')
    })
    const response = await app.request('/')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Order not found' })
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
