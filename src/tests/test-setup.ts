import { mock } from 'bun:test'
import { env } from '@/config'
import { toIsoString } from '@/utils/date.utils'
import { getOrderRef } from '@/utils/string.utils'
import {
  stripSensitiveUserFields,
  stripTimestamps,
} from '@/utils/transform.utils'
import type { Order, OrderUpdate } from '@/types'

env.stripeSecret ??= 'sk_test_123'
env.stripeWebhookSecret ??= 'whsec_test'

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
  getOrderById: mock(),
  getOrdersByEmail: mock(),
  createOrder: mock(),
  linkPaymentIntent: mock(),
  updateOrder: mock(),
  updateOrderIfUnchanged: mock(
    async (paymentId: string, _expected: unknown, fields: OrderUpdate) => {
      const result: unknown = await mockOrdersDB.updateOrder(paymentId, fields)
      return result as { order: Order | null; becamePaid: boolean }
    },
  ),
  deleteOrderById: mock(),
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
export const mockSendMail = mock()
export const mockEnqueueEmail = mock()
export const mockCancelAdminPaymentErrorAlert = mock(() =>
  Promise.resolve(false),
)
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
  on: mock(),
  close: mock(() => Promise.resolve()),
  getJob: mock(),
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
  safeValidate: mock(() => null),
  LogLevel: {
    enum: { debug: 'debug', info: 'info', warn: 'warn', error: 'error' },
  },
  logSchema: {},
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

await mock.module('@/queues', () => ({
  emailQueue: mockEmailQueue,
  enqueueEmail: mockEnqueueEmail,
  cancelAdminPaymentErrorAlert: mockCancelAdminPaymentErrorAlert,
}))

await mock.module('@/libs', () => ({
  log: mockLogger,
  logWorker: mockLogger,
  stripe: mockStripe,
  sendMail: mockSendMail,
  closeMailer: mock(),
}))

await mock.module('@/utils', () => ({
  extractPaymentIntentFields: mockExtractPaymentIntentFields,
  getPaymentIntentId: mockGetPaymentIntentId,
  signAccessToken: mockSignAccessToken,
  signRefreshToken: mockSignRefreshToken,
  uploadFile: mockUploadFile,
  stripSensitiveUserFields,
  stripTimestamps,
  toIsoString,
  getOrderRef,
  Folder: {
    Avatars: 'avatars',
    ProductImages: 'product-images',
  },
}))

await mock.module('ioredis', () => ({
  default: mockIORedis,
}))

await mock.module('bullmq', () => ({
  Queue: mock(() => mockEmailQueue),
  Worker: mock(() => mockWorker),
}))
