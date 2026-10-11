import { type MiddlewareHandler } from 'hono'
import { errorHandler, Forbidden } from '@/errors'
import { type AuthVariables, UserRole } from '@/types'
import { authMiddleware } from './auth.middleware'

export const authAdminMiddleware: MiddlewareHandler<{
  Variables: AuthVariables
}> = async (c, next) => {
  try {
    return await authMiddleware(c, async () => {
      const user = c.get('authUser')

      if (user.role !== UserRole.Admin) {
        throw new Forbidden(`Unauthorized access attempt: ${user.email}`)
      }

      await next()
    })
  } catch (error) {
    return errorHandler(c, error)
  }
}
