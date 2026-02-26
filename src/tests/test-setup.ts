import { mock } from 'bun:test'
import { stripSensitiveUserFields, stripTimestamps } from '@/utils'

export const mockUsersDB = {
  getUserBy: mock(),
  createUser: mock(),
  updateUserBy: mock(),
}

export const mockBooksDB = {
  getBookById: mock(),
}

export const mockOrdersDB = {
  getOrder: mock(),
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
export const mockSendAdminNotificationEmail = mock()

export const mockLogger = {
  info: mock(),
  warn: mock(),
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
  booksDB: mockBooksDB,
  usersDB: mockUsersDB,
  ordersDB: mockOrdersDB,
}))

await mock.module('stripe', () => {
  const mockStripeCtor = mock(() => mockStripe)
  return {
    Stripe: mockStripeCtor,
    default: mockStripeCtor,
  }
})

await mock.module('@/validation', () => ({
  validate: mockValidate,
  orderInsertSchema: {},
  paymentIdSchema: {},
  paymentIntentRequestSchema: {},
  loginSchema: {},
  registerSchema: {},
  emailSchema: {},
  tokenSchema: {},
  passwordResetSchema: {},
  imageSchema: {},
  userUpdateSchema: {},
}))

await mock.module('@/utils', () => ({
  sendAdminNotificationEmail: mockSendAdminNotificationEmail,
  AdminNotificationEnum: {
    Created: 'created',
    Confirmed: 'confirmed',
    Error: 'error',
  },
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
  log: { info: mock(), warn: mock(), error: mock() },
  logWorker: { info: mock(), warn: mock(), error: mock() },
  sendEmail: mock(),
}))

await mock.module('ioredis', () => ({
  default: mockIORedis,
}))

await mock.module('bullmq', () => ({
  Worker: mock(() => mockWorker),
}))
