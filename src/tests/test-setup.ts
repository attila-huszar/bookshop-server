import { mock } from 'bun:test'
import { EventEmitter } from 'node:events'
import { env } from '@/config'
import * as validation from '@/validation'
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
  getBooks: mock(),
  getRecommendedBooks: mock(),
  searchBooks: mock(),
  getBookById: mock(),
  insertBook: mock(),
  updateBook: mock(),
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
  backend: {
    connection: Object.assign(new EventEmitter(), {
      status: 'initializing' as const,
    }),
  },
  add: mock(),
  on: mock(),
  close: mock(() => Promise.resolve()),
  getJob: mock(),
}

export const mockWorker = {
  backend: {
    connection: Object.assign(new EventEmitter(), {
      status: 'initializing' as const,
    }),
    blockingConnection: Object.assign(new EventEmitter(), {
      status: 'initializing' as const,
    }),
  },
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

const logger = await import('@/libs/logger')

await mock.module('@/libs/logger', () => ({
  ...logger,
  log: mockLogger,
  frontendLog: mockLogger,
}))

const mailer = await import('@/libs/nodemailer')

await mock.module('@/libs/nodemailer', () => ({
  ...mailer,
  sendMail: mockSendMail,
  closeMailer: mock(),
}))

const [
  stripeUtilities,
  jwtUtilities,
  fileUtilities,
  dateUtilities,
  stringUtilities,
] = await Promise.all([
  import('@/utils/stripe.utils'),
  import('@/utils/jwt.utils'),
  import('@/utils/file.utils'),
  import('@/utils/date.utils'),
  import('@/utils/string.utils'),
])

await mock.module('@/utils/stripe.utils', () => ({
  ...stripeUtilities,
  extractPaymentIntentFields: mockExtractPaymentIntentFields,
}))

await mock.module('@/utils/jwt.utils', () => ({
  ...jwtUtilities,
  signAccessToken: mockSignAccessToken,
  signRefreshToken: mockSignRefreshToken,
  verifyJWTRefresh: mockVerifyJWTRefresh,
}))

await mock.module('@/utils/file.utils', () => ({
  ...fileUtilities,
  uploadFile: mockUploadFile,
}))

await mock.module('@/utils/ngrok', () => ({
  closeNgrokTunnel: mock(),
  ngrokForward: mock(),
}))

await mock.module('@/utils/date.utils', () => ({
  ...dateUtilities,
  formatUptime: mock(() => 'test uptime'),
}))

await mock.module('@/utils/string.utils', () => ({
  ...stringUtilities,
  shortHash: mock(() => 'test-fingerprint'),
}))

await mock.module('ioredis', () => ({
  default: mockIORedis,
}))

await mock.module('bullmq', () => ({
  Queue: mock(() => mockEmailQueue),
  Worker: mockWorkerConstructor,
}))
