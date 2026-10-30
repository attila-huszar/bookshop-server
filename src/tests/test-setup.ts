import { mock } from 'bun:test'
import { env } from '@/config'
import * as validation from '@/validation'
import { getOrderRef } from '@/utils/string.utils'
import type {
  Order,
  OrderUpdate,
  TermsDocument,
  TermsDocumentSummary,
} from '@/types'

env.adminEmail ??= 'admin@example.com'
env.clientBaseUrl ??= 'https://bookshop.test'
env.stripeSecret ??= 'sk_test_123'
env.stripeWebhookSecret ??= 'whsec_test'

export const mockUsersDB = {
  getActiveUserBy: mock(),
  emailExists: mock(),
  getAllUsers: mock(),
  setUsersDeleted: mock(),
  createUser: mock(),
  createUserWithVerification: mock(),
  setPasswordResetToken: mock(),
  verifyUserByToken: mock(),
  resetPasswordByToken: mock(),
  updateUserBy: mock(),
  cleanupExpiredPasswordResetTokens: mock(),
  cleanupUnverifiedUsers: mock(),
}

export const mockOutboxDB = {
  getEmailOutbox: mock(),
  updateEmailDelivery: mock(),
  claimEmail: mock(),
  completeEmail: mock(),
  retryEmail: mock(),
}

export const mockBooksDB = {
  getBookById: mock(),
  hardDeleteBooks: mock(),
}

export const mockTermsDB = {
  deleteUnusedTerms: mock<() => Promise<boolean>>(() => Promise.resolve(false)),
  getTermsHistory: mock<() => Promise<TermsDocumentSummary[]>>(() =>
    Promise.resolve([]),
  ),
  getCurrentTerms: mock<() => Promise<TermsDocument | null>>(() =>
    Promise.resolve(null),
  ),
  getTermsByVersion: mock(),
  publishTerms: mock(),
}

export const mockOrdersDB = {
  getOrder: mock(),
  getOrderById: mock(),
  getOrdersByEmail: mock(),
  getAllOrders: mock(),
  setOrdersDeleted: mock(),
  getOrderByCheckoutRequestId: mock(),
  createCheckoutOrder: mock(),
  recordTermsAcceptance: mock(),
  linkPaymentIntent: mock(),
  updateOrder: mock(),
  getOrdersForReconciliation: mock(),
  markUnlinkedOrderReconciled: mock(),
  markOrderReconciliationAttempted: mock(),
  recordReconciliationFailure: mock(() => Promise.resolve()),
  updateOrderIfUnchanged: mock(
    async (paymentId: string, _expected: unknown, fields: OrderUpdate) => {
      const result: unknown = await mockOrdersDB.updateOrder(paymentId, fields)

      return result as Order | null
    },
  ),
}

export const mockStripe = {
  webhooks: {
    constructEventAsync: mock(),
  },
  paymentIntents: {
    create: mock(),
    retrieve: mock(),
    search: mock(),
    cancel: mock(),
  },
}

export const mockValidate = mock()
export const mockSignAccessToken = mock()
export const mockSignRefreshToken = mock()
export const mockVerifyJWTRefresh = mock()
export const mockUploadFile = mock()
export const mockSendMail = mock()
export const mockExtractPaymentIntentFields = mock(() => ({}))
export const mockLogger = {
  debug: mock(),
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

export const mockWorkerConstructor = mock<
  (
    queueName: unknown,
    processor: unknown,
    options: unknown,
  ) => typeof mockWorker
>(() => mockWorker)

export const mockIORedis = mock(() => mockWorker)

export async function mockRepositories(): Promise<void> {
  await mock.module('@/repositories', () => ({
    authorsDB: { hardDeleteAuthors: mock() },
    newsDB: {},
    booksDB: mockBooksDB,
    usersDB: mockUsersDB,
    ordersDB: mockOrdersDB,
    outboxDB: mockOutboxDB,
    termsDB: mockTermsDB,
  }))
}

await mockRepositories()

await mock.module('stripe', () => {
  const mockStripeCtor = mock(() => mockStripe)

  return {
    Stripe: mockStripeCtor,
    default: mockStripeCtor,
  }
})

await mock.module('@/validation', () => ({
  ...validation,
  validate: mockValidate,
  safeValidate: mock(() => null),
}))

await mock.module('@/libs', () => ({
  log: mockLogger,
  frontendLog: mockLogger,
  logWorker: mockLogger,
  stripe: mockStripe,
  sendMail: mockSendMail,
  closeMailer: mock(),
}))

await mock.module('@/utils', () => ({
  extractPaymentIntentFields: mockExtractPaymentIntentFields,
  signAccessToken: mockSignAccessToken,
  signRefreshToken: mockSignRefreshToken,
  verifyJWTRefresh: mockVerifyJWTRefresh,
  uploadFile: mockUploadFile,
  getOrderRef,
  closeNgrokTunnel: mock(),
  formatUptime: mock(() => 'test uptime'),
  ngrokForward: mock(),
  shortHash: mock(() => 'test-fingerprint'),
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
  Worker: mockWorkerConstructor,
}))
