import { mock } from 'bun:test'
import {
  stripSensitiveUserFields,
  stripTimestamps,
} from '@/utils/transform.utils'

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
  webhooks: {
    constructEventAsync: mock(),
  },
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
export const mockExtractPaymentIntentFields = mock(() => ({}))
export const mockGetPaymentIntentId = mock(
  (source: { payment_intent?: unknown }) =>
    typeof source.payment_intent === 'string'
      ? source.payment_intent
      : ((source.payment_intent as { id?: string } | undefined)?.id ??
        undefined),
)

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
  extractPaymentIntentFields: mockExtractPaymentIntentFields,
  getPaymentIntentId: mockGetPaymentIntentId,
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

await mock.module('@/utils/email.utils', () => ({
  sendAdminNotificationEmail: mockSendAdminNotificationEmail,
}))

await mock.module('@/queues', () => ({
  emailQueue: mockEmailQueue,
}))

await mock.module('@/libs', () => ({
  log: mockLogger,
  logWorker: mockLogger,
  sendEmail: mock(),
}))

await mock.module('ioredis', () => ({
  default: mockIORedis,
}))

await mock.module('bullmq', () => ({
  Worker: mock(() => mockWorker),
}))
