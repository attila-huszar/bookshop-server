import { ordersDB } from '@/repositories'
import { log } from '@/libs'
import { reconcileOrderPayment } from './orders.service'

const MINIMUM_ORDER_AGE_MS = 5 * 60 * 1000
const PENDING_CHECK_INTERVAL_MS = 30 * 60 * 1000
const TERMINAL_AUDIT_INTERVAL_MS = 24 * 60 * 60 * 1000
const BATCH_SIZE = 100
const RUN_BUDGET_MS = 8 * 60 * 1000

export async function reconcileStaleOrders(): Promise<{
  checked: number
  failed: number
}> {
  const now = Date.now()
  const orders = await ordersDB.getOrdersForReconciliation({
    staleBefore: new Date(now - MINIMUM_ORDER_AGE_MS),
    checkedBefore: new Date(now - PENDING_CHECK_INTERVAL_MS),
    terminalCheckedBefore: new Date(now - TERMINAL_AUDIT_INTERVAL_MS),
    limit: BATCH_SIZE,
  })
  let failed = 0
  let checked = 0
  for (const order of orders) {
    if (Date.now() - now >= RUN_BUDGET_MS) break
    checked++
    try {
      // Pace failed checks too, so persistently broken orders cannot monopolize a batch.
      await ordersDB.markOrderReconciliationAttempted(order.id, new Date())
      await reconcileOrderPayment(order.id)
    } catch (error) {
      failed++
      void log.error('[STRIPE] Order reconciliation failed', {
        error,
        orderId: order.id,
        paymentId: order.paymentId,
      })
    }
  }
  const result = { checked, failed }
  void log.info('[STRIPE] Order reconciliation completed', result)
  return result
}
