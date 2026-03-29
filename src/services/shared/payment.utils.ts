import { ordersDB } from '@/repositories'
import { paymentIdSchema, validate } from '@/validation'
import { log } from '@/libs'
import { enqueueEmail } from '@/queues'
import { Unauthorized } from '@/errors/Unauthorized'
import {
  AdminNotification,
  type AdminPaymentNotificationOrder,
  IssueCode,
  type Order,
  type PaymentIntentStatus,
} from '@/types'

export type PaymentAccess = {
  paymentSessionId?: string
  userEmail?: string
}

type SaveOperation = 'create' | 'update'
type SaveFailureReason = 'threw' | 'returned_null'

type ReportOrderSaveErrorParams = {
  issueCode: IssueCode
  operation: SaveOperation
  paymentId: string
  order: AdminPaymentNotificationOrder
  saveFailureReason: SaveFailureReason
  saveError?: unknown
  dbStatus?: PaymentIntentStatus
  stripeStatus?: PaymentIntentStatus
  message?: string
  notifyAdmin?: boolean
  additionalContext?: Record<string, unknown>
}

export async function resolveAuthorizedPayment(
  paymentId: string,
  access: PaymentAccess,
): Promise<{ validatedId: string; order: Order }> {
  const validatedId = validate(paymentIdSchema, paymentId)
  const order = await ordersDB.getOrder(validatedId)

  if (!order) {
    throw new Unauthorized('Unauthorized payment access')
  }

  const accessEmail = access?.userEmail?.toLowerCase()
  const hasSessionAccess = access?.paymentSessionId === validatedId
  const hasEmailAccess =
    Boolean(accessEmail) && order.email?.toLowerCase() === accessEmail

  if (!hasSessionAccess && !hasEmailAccess) {
    throw new Unauthorized('Unauthorized payment access')
  }

  return { validatedId, order }
}

export function reportOrderSaveError({
  issueCode,
  operation,
  paymentId,
  order,
  saveFailureReason,
  saveError,
  dbStatus,
  stripeStatus,
  message = '[CRITICAL] Order save failed',
  notifyAdmin = true,
  additionalContext,
}: ReportOrderSaveErrorParams): void {
  void log.error(message, {
    issueCode,
    entity: 'order',
    operation,
    paymentId,
    saveFailureReason,
    dbStatus,
    stripeStatus,
    error: saveError,
    ...additionalContext,
  })

  if (notifyAdmin) {
    enqueueEmail('adminPaymentNotification', {
      notificationType: AdminNotification.Error,
      order,
    })
  }
}
