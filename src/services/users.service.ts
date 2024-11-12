import { getUserByEmail } from '../repository'
import { validateEmail, validatePassword } from '../utils'
import * as Error from '../errors'

export const validateLogin = async (req: {
  email: string
  password: string
}): Promise<{ uuid: string }> => {
  if (
    !['email', 'password'].every((key) => key in req) ||
    !req.email?.trim() ||
    !req.password?.trim()
  ) {
    throw new Error.BadRequest('Email and password required')
  }

  if (!validateEmail(req.email)) {
    throw new Error.BadRequest('Invalid email format')
  }

  if (!validatePassword(req.password)) {
    throw new Error.BadRequest('Invalid password format')
  }

  const user = await getUserByEmail(req.email)

  if (!user.verified) {
    throw new Error.Forbidden('Email not verified')
  }

  const isPasswordCorrect = await Bun.password.verify(
    req.password,
    user.password,
  )

  if (isPasswordCorrect) {
    return { uuid: user.uuid }
  }

  throw new Error.Unauthorized()
}
