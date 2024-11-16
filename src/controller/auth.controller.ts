import { Hono } from 'hono'
import { deleteCookie } from 'hono/cookie'
import { getUserBy } from '../repository'

type Variables = {
  jwtPayload: {
    uuid: string
  }
}

export const auth = new Hono<{ Variables: Variables }>()

auth.post('/profile', async (c) => {
  const jwtPayload = c.get('jwtPayload')

  const user = await getUserBy('uuid', jwtPayload.uuid)
  const {
    id,
    uuid,
    password,
    verified,
    verificationToken,
    verificationExpires,
    passwordResetToken,
    passwordResetExpires,
    createdAt,
    updatedAt,
    ...userWithoutCreds
  } = user

  return c.json(userWithoutCreds)
})

auth.post('/logout', (c) => {
  deleteCookie(c, 'refresh-token', {
    httpOnly: true,
    secure: Bun.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/users/refresh',
  })

  const isUuidDeleted = deleteCookie(c, 'uuid')

  if (isUuidDeleted) {
    return c.json({ message: 'Logged out' })
  }

  return c.json({ error: 'Logout failed' }, 500)
})
