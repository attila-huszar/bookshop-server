import { beforeEach, describe, expect, it } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { loginSchema } from '@/validation/authSchemas'
import { profileUpdateSchema } from '@/validation/userSchemas'
import { authMessage, userMessage } from '@/constants'
import { BadRequest, Forbidden, Unauthorized } from '@/errors'
import {
  type PasswordResetTokenUpdate,
  type User,
  type UserRegistrationInsert,
  UserRole,
} from '@/types'
import {
  mockSignAccessToken,
  mockSignRefreshToken,
  mockUsersDB,
  mockValidate,
} from './test-setup'

const usersService = await import('../services/users.service')

beforeEach(() => {
  mockValidate.mockReset()
  mockUsersDB.getActiveUserBy.mockReset()
  mockUsersDB.emailExists.mockReset()
  mockUsersDB.createUser.mockReset()
  mockUsersDB.createUserWithVerification.mockReset()
  mockUsersDB.setPasswordResetToken.mockReset()
  mockUsersDB.verifyUserByToken.mockReset()
  mockUsersDB.resetPasswordByToken.mockReset()
  mockUsersDB.updateUserBy.mockReset()
  mockSignAccessToken.mockReset()
  mockSignRefreshToken.mockReset()
})

describe('Users Service', () => {
  describe('updateUserProfile', () => {
    const profileUser = { uuid: 'user-uuid', password: 'unused-hash' }

    beforeEach(() => {
      mockValidate.mockImplementation((_schema: unknown, value: unknown) =>
        profileUpdateSchema.parse(value),
      )
    })

    it('rejects privileged fields before accessing the database', async () => {
      const fields = { firstName: 'Jane', role: UserRole.Admin }

      await rejects(usersService.updateUserProfile(profileUser, fields))
      expect(mockUsersDB.getActiveUserBy).not.toHaveBeenCalled()
      expect(mockUsersDB.updateUserBy).not.toHaveBeenCalled()
    })

    it('rejects weak passwords and missing current passwords', async () => {
      for (const fields of [
        { password: 'weak', currentPassword: 'old123' },
        { password: 'new123' },
      ]) {
        await rejects(usersService.updateUserProfile(profileUser, fields))
      }

      expect(mockUsersDB.updateUserBy).not.toHaveBeenCalled()
    })

    it('rejects an incorrect current password', async () => {
      const user = {
        uuid: 'user-uuid',
        password: Bun.password.hashSync('old123'),
      }

      await rejects(
        usersService.updateUserProfile(user, {
          password: 'new123',
          currentPassword: 'wrong123',
        }),
        /Current password is incorrect/,
      )
      expect(mockUsersDB.updateUserBy).not.toHaveBeenCalled()
    })

    it('hashes the new password without persisting the current password', async () => {
      const user = {
        uuid: 'user-uuid',
        email: 'user@example.com',
        password: Bun.password.hashSync('old123'),
      }

      mockUsersDB.updateUserBy.mockResolvedValueOnce(user)
      await usersService.updateUserProfile(user, {
        password: 'new123',
        currentPassword: 'old123',
      })
      const [, , fields] = mockUsersDB.updateUserBy.mock.calls[0] as [
        string,
        string,
        { password: string },
      ]

      expect(await Bun.password.verify('new123', fields.password)).toBe(true)
      expect(fields).not.toHaveProperty('currentPassword')
      expect(mockUsersDB.getActiveUserBy).not.toHaveBeenCalled()
      expect(mockUsersDB.updateUserBy).toHaveBeenCalledWith(
        'uuid',
        user.uuid,
        fields,
      )
    })
  })

  describe('loginUser', () => {
    it('should login user successfully', async () => {
      const loginRequest = {
        email: 'test@example.com',
        password: 'password123',
      }
      const mockUser = {
        uuid: 'user-uuid',
        email: 'test@example.com',
        password: Bun.password.hashSync('password123'),
        verified: true,
        firstName: 'John',
      }

      mockValidate.mockReturnValueOnce(loginRequest)
      mockUsersDB.getActiveUserBy.mockResolvedValueOnce(mockUser)
      mockSignAccessToken.mockResolvedValueOnce('access-token')
      mockSignRefreshToken.mockResolvedValueOnce('refresh-token')

      const result = await usersService.loginUser(loginRequest)

      expect(mockValidate).toHaveBeenCalledWith(loginSchema, loginRequest)
      expect(mockUsersDB.getActiveUserBy).toHaveBeenCalledWith(
        'email',
        'test@example.com',
      )
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        firstName: 'John',
      })
    })

    it('should throw error for non-existent user', async () => {
      const loginRequest = {
        email: 'test@example.com',
        password: 'password123',
      }

      mockValidate.mockReturnValueOnce(loginRequest)
      mockUsersDB.getActiveUserBy.mockResolvedValueOnce(null)

      let resultError: unknown = null

      try {
        await usersService.loginUser(loginRequest)
      } catch (error) {
        resultError = error
      }

      expect(resultError).toBeInstanceOf(Unauthorized)
      expect((resultError as Error).message).toBe(
        authMessage.credentialsInvalid,
      )
    })

    it('should throw error for unverified user', async () => {
      const loginRequest = {
        email: 'test@example.com',
        password: 'password123',
      }
      const mockUser = {
        email: 'test@example.com',
        password: Bun.password.hashSync('password123'),
        verified: false,
      }

      mockValidate.mockReturnValueOnce(loginRequest)
      mockUsersDB.getActiveUserBy.mockResolvedValueOnce(mockUser)

      let resultError: unknown = null

      try {
        await usersService.loginUser(loginRequest)
      } catch (error) {
        resultError = error
      }

      expect(resultError).toBeInstanceOf(Forbidden)
      expect((resultError as Error).message).toBe(userMessage.verifyFirst)
    })

    it('checks the password before reporting an unverified email address', async () => {
      const request = { email: 'test@example.com', password: 'wrong' }

      mockValidate.mockReturnValueOnce(request)
      mockUsersDB.getActiveUserBy.mockResolvedValueOnce({
        verified: false,
        password: Bun.password.hashSync('password123'),
      })

      await rejects(usersService.loginUser(request), {
        name: Unauthorized.name,
        message: authMessage.credentialsInvalid,
      })
      expect(mockSignAccessToken).not.toHaveBeenCalled()
      expect(mockSignRefreshToken).not.toHaveBeenCalled()
    })
  })

  describe('registerUser', () => {
    it('should register user successfully', async () => {
      const formData = new FormData()

      formData.append('firstName', 'John')
      formData.append('lastName', 'Doe')
      formData.append('email', 'test@example.com')
      formData.append('password', 'password123')

      const validatedData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'test@example.com',
        password: 'password123',
      }

      const mockUser = { email: 'test@example.com' }

      mockValidate.mockReturnValueOnce(validatedData)
      mockUsersDB.emailExists.mockResolvedValueOnce(false)
      mockUsersDB.createUserWithVerification.mockResolvedValueOnce(mockUser)

      const result = await usersService.registerUser(formData)

      expect(mockValidate).toHaveBeenCalled()
      expect(mockUsersDB.emailExists).toHaveBeenCalledWith('test@example.com')
      expect(mockUsersDB.getActiveUserBy).not.toHaveBeenCalled()
      expect(mockUsersDB.createUserWithVerification).toHaveBeenCalledTimes(1)
      const [createdUser] = mockUsersDB.createUserWithVerification.mock
        .calls[0] as [UserRegistrationInsert]

      expect(createdUser).toMatchObject({
        email: 'test@example.com',
        firstName: 'John',
        verified: false,
      })
      expect(createdUser.verificationToken).toBeString()
      expect(createdUser.verificationExpires).toBeInstanceOf(Date)
      expect(mockUsersDB.createUser).not.toHaveBeenCalled()
      expect(result).toEqual({ email: 'test@example.com' })
    })

    it('rejects an email that is already reserved', async () => {
      const formData = new FormData()

      formData.append('email', 'test@example.com')

      const validatedData = { email: 'test@example.com' }

      mockValidate.mockReturnValueOnce(validatedData)
      mockUsersDB.emailExists.mockResolvedValueOnce(true)

      await rejects(usersService.registerUser(formData), {
        name: BadRequest.name,
        message: userMessage.emailTaken,
      })
      expect(mockUsersDB.emailExists).toHaveBeenCalledWith('test@example.com')
      expect(mockUsersDB.getActiveUserBy).not.toHaveBeenCalled()
      expect(mockUsersDB.createUserWithVerification).not.toHaveBeenCalled()
    })
  })

  describe('verifyUser', () => {
    it('should verify user successfully', async () => {
      const verificationRequest = { token: 'verification-token' }
      const updatedUser = { email: 'test@example.com' }

      mockValidate.mockReturnValueOnce(verificationRequest)
      mockUsersDB.verifyUserByToken.mockResolvedValueOnce(updatedUser)

      const result = await usersService.verifyUser(verificationRequest)

      expect(mockUsersDB.verifyUserByToken).toHaveBeenCalledWith(
        'verification-token',
      )
      expect(mockUsersDB.getActiveUserBy).not.toHaveBeenCalled()
      expect(mockUsersDB.updateUserBy).not.toHaveBeenCalled()
      expect(result).toEqual({ email: 'test@example.com' })
    })

    it('rejects a token that cannot be consumed instead of reporting a server error', async () => {
      mockValidate.mockReturnValueOnce({ token: 'used-token' })
      mockUsersDB.verifyUserByToken.mockResolvedValueOnce(null)

      await rejects(usersService.verifyUser({ token: 'used-token' }), {
        name: BadRequest.name,
        message: authMessage.invalidToken,
      })
    })
  })

  describe('passwordResetRequest', () => {
    it('should send password reset email for existing user', async () => {
      const request = { email: 'test@example.com' }
      const mockUser = {
        uuid: 'user-uuid',
        email: 'test@example.com',
        firstName: 'John',
      }
      const updatedUser = { email: 'test@example.com' }

      mockValidate.mockReturnValueOnce(request)
      mockUsersDB.getActiveUserBy.mockResolvedValueOnce(mockUser)
      mockUsersDB.setPasswordResetToken.mockResolvedValueOnce(updatedUser)

      const result = await usersService.passwordResetRequest(request)

      expect(mockUsersDB.setPasswordResetToken).toHaveBeenCalledTimes(1)
      const [uuid, reset] = mockUsersDB.setPasswordResetToken.mock.calls[0] as [
        string,
        PasswordResetTokenUpdate,
      ]

      expect(uuid).toBe('user-uuid')
      expect(reset.token).toBeString()
      expect(reset.expiresAt).toBeInstanceOf(Date)
      expect(mockUsersDB.updateUserBy).not.toHaveBeenCalled()
      expect(result).toHaveProperty('message')
    })

    it('should return success message for non-existent user', async () => {
      const request = { email: 'nonexistent@example.com' }

      mockValidate.mockReturnValueOnce(request)
      mockUsersDB.getActiveUserBy.mockResolvedValueOnce(null)

      const result = await usersService.passwordResetRequest(request)

      expect(result).toHaveProperty('message')
      expect(mockUsersDB.setPasswordResetToken).not.toHaveBeenCalled()
    })
  })

  describe('password reset tokens', () => {
    const token = 'reset-token'

    it.each([
      { name: 'missing', expiry: null },
      { name: 'expired', expiry: new Date(0) },
      { name: 'invalid', expiry: new Date('invalid') },
    ])(
      'rejects $name expiry during both preview and submission',
      async ({ expiry }) => {
        mockUsersDB.getActiveUserBy.mockResolvedValue({
          passwordResetToken: token,
          passwordResetExpires: expiry,
        })
        const request = { token, password: 'new123' }

        for (const operation of [
          usersService.passwordResetToken,
          usersService.passwordResetSubmit,
        ]) {
          mockValidate.mockReturnValueOnce(request)
          await rejects(operation(request), {
            name: BadRequest.name,
            message: authMessage.invalidToken,
          })
        }

        expect(mockUsersDB.resetPasswordByToken).not.toHaveBeenCalled()
      },
    )

    it('previews an active token without consuming it', async () => {
      mockValidate.mockReturnValueOnce({ token })
      mockUsersDB.getActiveUserBy.mockResolvedValueOnce({
        passwordResetToken: token,
        passwordResetExpires: new Date(Date.now() + 60_000),
      })

      expect(await usersService.passwordResetToken({ token })).toEqual({
        token,
      })
      expect(mockUsersDB.resetPasswordByToken).not.toHaveBeenCalled()
    })

    it('hashes the password and consumes only the submitted token', async () => {
      const request = { token, password: 'new123' }

      mockValidate.mockReturnValueOnce(request)
      mockUsersDB.getActiveUserBy.mockResolvedValueOnce({
        passwordResetToken: token,
        passwordResetExpires: new Date(Date.now() + 60_000),
      })
      mockUsersDB.resetPasswordByToken.mockResolvedValueOnce({
        email: 'test@example.com',
      })

      expect(await usersService.passwordResetSubmit(request)).toEqual({
        message: userMessage.passwordResetSuccess,
      })
      const [savedToken, password] = mockUsersDB.resetPasswordByToken.mock
        .calls[0] as [string, string]

      expect(savedToken).toBe(token)
      expect(await Bun.password.verify(request.password, password)).toBe(true)
      expect(mockUsersDB.updateUserBy).not.toHaveBeenCalled()
    })

    it('rejects a token replaced or consumed while hashing the password', async () => {
      const request = { token, password: 'new123' }

      mockValidate.mockReturnValueOnce(request)
      mockUsersDB.getActiveUserBy.mockResolvedValueOnce({
        passwordResetToken: token,
        passwordResetExpires: new Date(Date.now() + 60_000),
      })
      mockUsersDB.resetPasswordByToken.mockResolvedValueOnce(null)

      await rejects(usersService.passwordResetSubmit(request), {
        name: BadRequest.name,
        message: authMessage.invalidToken,
      })
    })
  })

  describe('getActiveUser', () => {
    it('expires a session whose account no longer exists', async () => {
      mockUsersDB.getActiveUserBy.mockResolvedValueOnce(null)

      await rejects(
        usersService.getActiveUser('deleted-user-uuid'),
        Unauthorized,
      )
    })

    it('preserves optional missing-user lookup for guest checkout', async () => {
      mockUsersDB.getActiveUserBy.mockResolvedValueOnce(null)

      expect(
        await usersService.getActiveUser('deleted-user-uuid', {
          optional: true,
        }),
      ).toBeNull()
    })

    it('returns the loaded user for internal request context', async () => {
      const mockUser: User = {
        id: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        uuid: 'user-uuid',
        firstName: 'John',
        lastName: 'Doe',
        email: 'test@example.com',
        password: Bun.password.hashSync('password123'),
        country: 'hu',
        verified: true,
        verificationToken: null,
        verificationExpires: null,
        passwordResetToken: null,
        passwordResetExpires: null,
        role: UserRole.User,
        avatar: null,
        address: null,
        phone: null,
        deletedAt: null,
      }

      mockUsersDB.getActiveUserBy.mockResolvedValueOnce(mockUser)

      const result = await usersService.getActiveUser('user-uuid')

      expect(mockUsersDB.getActiveUserBy).toHaveBeenCalledWith(
        'uuid',
        'user-uuid',
      )
      expect(result).toBe(mockUser)
    })
  })
})
