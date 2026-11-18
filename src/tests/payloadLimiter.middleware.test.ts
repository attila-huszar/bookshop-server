import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { payloadLimiter } from '@/middleware/payloadLimiter.middleware'
import { MAX_IMAGE_SIZE_BYTES, MAX_JSON_SIZE_KIB } from '@/constants/fileLimits'

const app = new Hono()
  .use('*', payloadLimiter)
  .post('/', (c) => c.text('accepted'))

describe('request payload limits', () => {
  it.each(['application/json', 'Application/JSON; charset=utf-8'])(
    'keeps JSON uploads within their configured size limit: %s',
    async (contentType) => {
      const body = JSON.stringify({
        text: 'x'.repeat(MAX_JSON_SIZE_KIB * 1024),
      })
      const response = await app.request('/', {
        method: 'POST',
        headers: {
          'content-type': contentType,
          'content-length': String(body.length),
        },
        body,
      })

      expect(response.status).toBe(413)
      expect(await response.json()).toMatchObject({
        code: 'PAYLOAD_TOO_LARGE',
        limit: `${MAX_JSON_SIZE_KIB} KB`,
      })
    },
  )

  it('accepts a JSON request below the size limit', async () => {
    const response = await app.request('/', {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-length': '2',
      },
      body: '{}',
    })

    expect(response.status).toBe(200)
  })

  it('applies the image allowance to multipart uploads even if a parameter mentions JSON', async () => {
    const body = [
      '--fixture',
      'Content-Disposition: form-data; name="avatar"; filename="avatar.png"',
      'Content-Type: image/png',
      '',
      'x'.repeat(MAX_JSON_SIZE_KIB * 1024 + 1),
      '--fixture--',
    ].join('\r\n')
    const contentType =
      'multipart/form-data; boundary=fixture; note="application/json"'
    const response = await app.request('/', {
      method: 'POST',
      headers: {
        'content-type': contentType,
        'content-length': String(body.length),
      },
      body,
    })

    expect(response.status).toBe(200)
  })

  it('continues to reject oversized multipart uploads', async () => {
    const response = await app.request('/', {
      method: 'POST',
      headers: {
        'content-type': 'multipart/form-data; boundary=fixture',
        'content-length': String(Math.ceil(MAX_IMAGE_SIZE_BYTES * 1.1) + 1),
      },
      body: 'fixture',
    })

    expect(response.status).toBe(413)
  })
})
