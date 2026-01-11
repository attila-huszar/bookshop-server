import { beforeEach, describe, expect, it } from 'bun:test'
import { type UserInsert, UserRole } from '@/types'
import * as usersService from '../services/users.service'
import {
  mockEmailQueue,
  mockSignAccessToken,
  mockSignRefreshToken,
  mockUsersDB,
  mockValidate,
} from './test-setup'

beforeEach(() => {
  mockEmailQueue.add.mockClear()
})

describe('Users Service', () => {
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
      mockUsersDB.getUserBy.mockResolvedValueOnce(mockUser)
      mockSignAccessToken.mockResolvedValueOnce('access-token')
      mockSignRefreshToken.mockResolvedValueOnce('refresh-token')

      const result = await usersService.loginUser(loginRequest)

      expect(mockValidate).toHaveBeenCalledWith({}, loginRequest)
      expect(mockUsersDB.getUserBy).toHaveBeenCalledWith(
        'email',
        'test@example.com',
      )
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        firstName: 'John',
      })
    })

    it('should throw error for non-existent user', () => {
      const loginRequest = {
        email: 'test@example.com',
        password: 'password123',
      }

      mockValidate.mockReturnValueOnce(loginRequest)
      mockUsersDB.getUserBy.mockResolvedValueOnce(null)

      expect(usersService.loginUser(loginRequest)).rejects.toThrow()
    })

    it('should throw error for unverified user', () => {
      const loginRequest = {
        email: 'test@example.com',
        password: 'password123',
      }
      const mockUser = {
        email: 'test@example.com',
        password: 'hashed-password',
        verified: false,
      }

      mockValidate.mockReturnValueOnce(loginRequest)
      mockUsersDB.getUserBy.mockResolvedValueOnce(mockUser)

      expect(usersService.loginUser(loginRequest)).rejects.toThrow()
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
      mockUsersDB.getUserBy.mockResolvedValueOnce(null)
      mockUsersDB.createUser.mockResolvedValueOnce(mockUser)
      mockEmailQueue.add.mockResolvedValueOnce(undefined)

      const result = await usersService.registerUser(formData)

      expect(mockValidate).toHaveBeenCalled()
      expect(mockUsersDB.getUserBy).toHaveBeenCalledWith(
        'email',
        'test@example.com',
      )
      expect(mockUsersDB.createUser).toHaveBeenCalled()
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'verification',
        expect.objectContaining({
          type: 'verification',
          toAddress: 'test@example.com',
          toName: 'John',
        }),
        expect.any(Object),
      )
      expect(result).toEqual({ email: 'test@example.com' })
    })

    it('should throw error for existing user', () => {
      const formData = new FormData()
      formData.append('email', 'test@example.com')

      const validatedData = { email: 'test@example.com' }
      const existingUser = { email: 'test@example.com' }

      mockValidate.mockReturnValueOnce(validatedData)
      mockUsersDB.getUserBy.mockResolvedValueOnce(existingUser)

      expect(usersService.registerUser(formData)).rejects.toThrow()
    })
  })

  describe('verifyUser', () => {
    it('should verify user successfully', async () => {
      const verificationRequest = { token: 'verification-token' }
      const mockUser = {
        email: 'test@example.com',
        verificationToken: 'verification-token',
      }
      const updatedUser = { email: 'test@example.com' }

      mockValidate.mockReturnValueOnce(verificationRequest)
      mockUsersDB.getUserBy.mockResolvedValueOnce(mockUser)
      mockUsersDB.updateUserBy.mockResolvedValueOnce(updatedUser)

      const result = await usersService.verifyUser(verificationRequest)

      expect(mockUsersDB.getUserBy).toHaveBeenCalledWith(
        'verificationToken',
        'verification-token',
      )
      expect(mockUsersDB.updateUserBy).toHaveBeenCalledWith(
        'email',
        'test@example.com',
        expect.objectContaining({
          verified: true,
          verificationToken: '',
          verificationExpires: '',
        }),
      )
      expect(result).toEqual({ email: 'test@example.com' })
    })
  })

  describe('passwordResetRequest', () => {
    it('should send password reset email for existing user', async () => {
      const request = { email: 'test@example.com' }
      const mockUser = {
        email: 'test@example.com',
        firstName: 'John',
      }
      const updatedUser = { email: 'test@example.com' }

      mockValidate.mockReturnValueOnce(request)
      mockUsersDB.getUserBy.mockResolvedValueOnce(mockUser)
      mockUsersDB.updateUserBy.mockResolvedValueOnce(updatedUser)
      mockEmailQueue.add.mockResolvedValueOnce(undefined)

      const result = await usersService.passwordResetRequest(request)

      expect(mockUsersDB.updateUserBy).toHaveBeenCalled()
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'passwordReset',
        expect.objectContaining({
          type: 'passwordReset',
          toAddress: 'test@example.com',
          toName: 'John',
        }),
        expect.any(Object),
      )
      expect(result).toHaveProperty('message')
    })

    it('should return success message for non-existent user', async () => {
      const request = { email: 'nonexistent@example.com' }

      mockValidate.mockReturnValueOnce(request)
      mockUsersDB.getUserBy.mockResolvedValueOnce(null)

      const result = await usersService.passwordResetRequest(request)

      expect(result).toHaveProperty('message')
      expect(mockEmailQueue.add).not.toHaveBeenCalled()
    })
  })

  describe('getUserProfile', () => {
    it('should return user profile without sensitive data', async () => {
      const mockUser: UserInsert = {
        id: 1,
        uuid: 'user-uuid',
        firstName: 'John',
        lastName: 'Doe',
        email: 'test@example.com',
        password: Bun.password.hashSync('password123'),
        country: 'hu',
        verified: true,
        verificationToken: '',
        verificationExpires: '',
        passwordResetToken: '',
        passwordResetExpires: '',
        role: UserRole.User,
        avatar: '',
        address: {
          line1: '',
          line2: '',
          city: '',
          state: '',
          postal_code: '',
          country: '',
        },
        phone: '',
        createdAt: '2023-01-01',
        updatedAt: '2023-01-01',
      }

      mockUsersDB.getUserBy.mockResolvedValueOnce(mockUser)

      const result = await usersService.getUserProfile('user-uuid')

      expect(mockUsersDB.getUserBy).toHaveBeenCalledWith('uuid', 'user-uuid')
      expect(result).toEqual({
        firstName: 'John',
        lastName: 'Doe',
        email: 'test@example.com',
        country: 'hu',
        role: UserRole.User,
        avatar: '',
        address: {
          line1: '',
          line2: '',
          city: '',
          state: '',
          postal_code: '',
          country: '',
        },
        phone: '',
      })
      expect(result).not.toHaveProperty('password')
      expect(result).not.toHaveProperty('verificationToken')
    })
  })
})
