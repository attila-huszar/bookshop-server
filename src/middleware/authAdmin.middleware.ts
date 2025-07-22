import { type MiddlewareHandler } from 'hono'
import { jwt } from 'hono/jwt'
import { env } from '@/config'
import { getUserProfile } from '@/services'
import { errorHandler, Forbidden } from '@/errors'
import { UserRole } from '@/types'

type Variables = {
  jwtPayload: {
    uuid: string
  }
}

export const authAdminMiddleware: MiddlewareHandler<{
  Variables: Variables
}> = async (c, next) => {
  try {
    await jwt({ secret: env.jwtAccessSecret! })(c, async () => {
      const jwtPayload = c.get('jwtPayload')
      const user = await getUserProfile(jwtPayload.uuid)

      if (user.role !== UserRole.Admin) {
        throw new Forbidden(`Unauthorized access attempt: ${user.email}`)
      }

      await next()
    })
  } catch (error) {
    return errorHandler(c, error)
  }
}
