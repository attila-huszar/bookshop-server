import { verify } from 'hono/jwt'
import { env } from '@/config'
import { authJWTPayloadSchema } from '@/validation'
import type { AuthJWTPayload } from '@/types'

export const verifyJWTRefresh = async (
  token: string,
): Promise<AuthJWTPayload> => {
  try {
    const payload = await verify(token, env.jwtRefreshSecret!, { alg: 'HS256' })
    const parsedPayload = authJWTPayloadSchema.safeParse(payload)

    if (!parsedPayload.success) {
      throw new Error('Invalid refresh token payload', {
        cause: parsedPayload.error,
      })
    }

    return parsedPayload.data
  } catch (error) {
    throw new Error('Invalid refresh token', { cause: error })
  }
}
