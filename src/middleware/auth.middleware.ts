import { jwt } from 'hono/jwt'
import { env } from '../config'
import type { MiddlewareHandler } from 'hono'

export const authMiddleware: MiddlewareHandler = jwt({
  secret: env.jwtAccessSecret!,
})
