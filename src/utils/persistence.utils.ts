import { log } from '@/libs'
import { enqueueEmail } from '@/queues'
import { Internal } from '@/errors'
import {
  AdminNotification,
  IssueCode,
  type Order,
  type PaymentIntentStatus,
} from '@/types'

type OrderSnapshot = Pick<
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
  order: OrderSnapshot
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
