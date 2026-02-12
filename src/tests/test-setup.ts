import { mock } from 'bun:test'
import { stripSensitiveUserFields, stripTimestamps } from '@/utils'

export const mockUsersDB = {
  getUserBy: mock(),
  createUser: mock(),
  updateUserBy: mock(),
}

export const mockOrdersDB = {
  createOrder: mock(),
  updateOrder: mock(),
}

export const mockStripe = {
  paymentIntents: {
    create: mock(),
    retrieve: mock(),
    cancel: mock(),
  },
}

export const mockValidate = mock()
export const mockSignAccessToken = mock()
export const mockSignRefreshToken = mock()
export const mockUploadFile = mock()
export const mockSendEmail = mock()

export const mockLogger = {
  info: mock(),
  error: mock(),
}

export const mockEmailQueue = {
  add: mock(),
}

export const mockWorker = {
  on: mock(),
  close: mock(() => Promise.resolve()),
}

export const mockIORedis = mock(() => mockWorker)

await mock.module('@/repositories', () => ({
  usersDB: mockUsersDB,
  ordersDB: mockOrdersDB,
}))

await mock.module('stripe', () => ({
  Stripe: mock(() => mockStripe),
}))

await mock.module('@/validation', () => ({
  validate: mockValidate,
  loginSchema: {},
  registerSchema: {},
  emailSchema: {},
  tokenSchema: {},
  passwordResetSchema: {},
  imageSchema: {},
  userUpdateSchema: {},
}))

await mock.module('@/utils', () => ({
  signAccessToken: mockSignAccessToken,
  signRefreshToken: mockSignRefreshToken,
  uploadFile: mockUploadFile,
  stripSensitiveUserFields,
  stripTimestamps,
  Folder: {
    Avatars: 'avatars',
    ProductImages: 'product-images',
  },
}))

await mock.module('@/queues', () => ({
  emailQueue: mockEmailQueue,
}))

await mock.module('@/libs', () => ({
  log: { info: mock(), error: mock() },
  logWorker: { info: mock(), error: mock() },
  sendEmail: mock(),
}))

await mock.module('ioredis', () => ({
  default: mockIORedis,
}))

await mock.module('bullmq', () => ({
  Worker: mock(() => mockWorker),
}))
