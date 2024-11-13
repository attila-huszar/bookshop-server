import { jwt } from 'hono/jwt'
import { jwtAccessSecret } from '../config/envConfig'
import type { Context, Next } from 'hono'

export const authMiddleware = async (c: Context, next: Next) => {
  if (!jwtAccessSecret) throw new Error('JWT access secret not set')

  const jwtMiddleware = jwt({
    secret: jwtAccessSecret,
  })

  return jwtMiddleware(c, next)
}
