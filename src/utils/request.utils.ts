import type { Context } from 'hono'

export function isJsonRequest(c: Context): boolean {
  const contentType = c.req
    .header('content-type')
    ?.split(';')[0]
    ?.trim()
    .toLowerCase()

  return contentType === 'application/json'
}
