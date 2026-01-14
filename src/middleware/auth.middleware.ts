import { type MiddlewareHandler } from 'hono'
import { jwt } from 'hono/jwt'
import { env } from '@/config'

export const authMiddleware: MiddlewareHandler = jwt({
  secret: env.jwtAccessSecret!,
  alg: 'HS256',
})
