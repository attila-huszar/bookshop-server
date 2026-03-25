import { ordersDB } from '@/repositories'
import { paymentIdSchema, validate } from '@/validation'
import { toIsoString } from '@/utils'
import { log } from '@/libs'
import { enqueueEmail } from '@/queues'
import { paymentMessage } from '@/constants'
import { BadRequest, Internal, Unauthorized } from '@/errors'
import {
  AdminNotification,
  IssueCode,
  type Order,
  type PaymentIntentStatus,
  type PaymentSyncStatus,
} from '@/types'

export type PaymentAccess = {
  paymentSessionId?: string
  userEmail?: string
}

export type OrderPersistSnapshot = Pick<
  Order,
  'paymentId' | 'items' | 'total' | 'currency' | 'paymentStatus'
> &
  Partial<Pick<Order, 'firstName' | 'lastName' | 'email' | 'shipping'>>

type PersistFailureReason = 'threw' | 'returned_null'
type PersistOperation = 'create' | 'update'

type ReportCriticalOrderPersistFailureParams = {
  issueCode: IssueCode
  operation: PersistOperation
  paymentId: string
  order: OrderPersistSnapshot
  persistFailureReason: PersistFailureReason
  persistError?: unknown
  dbStatus?: PaymentIntentStatus
  stripeStatus?: PaymentIntentStatus
  message?: string
  notifyAdmin?: boolean
  additionalContext?: Record<string, unknown>
}

type ThrowCriticalOrderPersistFailureParams =
  ReportCriticalOrderPersistFailureParams & {
    throwMessage: string
    errorName?: string
    statusCode?: ConstructorParameters<typeof Internal>[2]
  }

function hasOrderPaymentAccess(
  paymentId: string,
  orderEmail: string | null,
  access?: PaymentAccess,
): boolean {
  if (access?.paymentSessionId === paymentId) return true

  return Boolean(
    access?.userEmail &&
    orderEmail?.toLowerCase() === access.userEmail.toLowerCase(),
  )
}

export async function resolveAuthorizedPayment(args: {
  paymentId: string
  access?: PaymentAccess
}): Promise<{ validatedId: string; order: Order }> {
  const validatedId = validate(paymentIdSchema, args.paymentId)
  const order = await ordersDB.getOrder(validatedId)

  if (!order || !hasOrderPaymentAccess(validatedId, order.email, args.access)) {
    throw new Unauthorized('Unauthorized payment access')
  }

  return { validatedId, order }
}

export function assertCancelablePaymentStatus(
  paymentStatus: Order['paymentStatus'],
): void {
  switch (paymentStatus) {
    case 'canceled':
      throw new BadRequest(paymentMessage.paymentAlreadyCanceled)
    case 'succeeded':
      throw new BadRequest(paymentMessage.paymentCannotCancelSucceeded)
    default:
      return
  }
}

export function toPaymentSyncStatus(order: Order): PaymentSyncStatus {
  return {
    paymentId: order.paymentId,
    paymentStatus: order.paymentStatus,
    amount: Math.round(order.total * 100),
    currency: order.currency,
    receiptEmail: order.email ?? null,
    shipping: order.shipping ?? null,
    finalizedAt: toIsoString(order.paidAt),
    webhookUpdatedAt: toIsoString(order.updatedAt),
  }
}

export function toOrderPersistSnapshot(
  order: Order,
  overrides: Partial<OrderPersistSnapshot> = {},
): OrderPersistSnapshot {
  return {
    paymentId: order.paymentId,
    paymentStatus: order.paymentStatus,
    items: order.items,
    total: order.total,
    currency: order.currency,
    firstName: order.firstName,
    lastName: order.lastName,
    email: order.email,
    shipping: order.shipping,
    ...overrides,
  }
}

export function reportCriticalOrderPersistFailure({
  issueCode,
  operation,
  paymentId,
  order,
  persistFailureReason,
  persistError,
  dbStatus,
  stripeStatus,
  message = '[CRITICAL] Order persistence failed',
  notifyAdmin = true,
  additionalContext,
}: ReportCriticalOrderPersistFailureParams): void {
  void log.error(message, {
    issueCode,
    entity: 'order',
    operation,
    paymentId,
    persistFailureReason,
    dbStatus,
    stripeStatus,
    error: persistError,
    ...additionalContext,
  })

  if (notifyAdmin) {
    enqueueEmail('adminPaymentNotification', {
      notificationType: AdminNotification.Error,
      order,
    })
  }
}

export function throwCriticalOrderPersistFailure({
  throwMessage,
  errorName = 'InternalServerError',
  statusCode = 500,
  ...params
}: ThrowCriticalOrderPersistFailureParams): never {
  reportCriticalOrderPersistFailure(params)
  throw new Internal(throwMessage, errorName, statusCode)
}
