import { jwt } from 'hono/jwt'
import { env } from '../config'
import type { Context, ContextVariableMap, Next } from 'hono'

export const authMiddleware = async (
  c: Context<
    { Variables: ContextVariableMap & Record<string, string> },
    string,
    object
  >,
  next: Next,
) => {
  if (!env.jwtAccessSecret) throw new Error('JWT access secret not set')

  const jwtMiddleware = jwt({
    secret: env.jwtAccessSecret,
  })

  return jwtMiddleware(c, next)
}
