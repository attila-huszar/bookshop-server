import mongoose from 'mongoose'
import type { Order } from '@/types'
import { autoIncrementPlugin } from './'

const orderSchema = new mongoose.Schema<Order>(
  {
    id: { type: Number, unique: true, index: true },
    paymentId: { type: String, default: null },
    checkoutRequestId: { type: String, required: true },
    termsAcceptance: {
      type: new mongoose.Schema(
        {
          version: { type: String, required: true },
          language: { type: String, enum: ['en', 'hu'], required: true },
          acceptedAt: { type: String, required: true },
          statement: { type: String, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    paymentStatus: { type: String, default: 'processing', required: true },
    lastStripeEventCreated: { type: Number, default: null },
    lastStripeEventId: { type: String, default: null },
    lastReconciliationAttemptAt: { type: Date, default: null },
    lastReconciledAt: { type: Date, default: null },
    reconciliationFailures: { type: Number, required: true, default: 0 },
    reconciliationAlertId: { type: String, default: null },
    paidAt: { type: Date, default: null },
    total: { type: Number, required: true },
    currency: { type: String, required: true },
    items: { type: [Object], required: true },
    firstName: { type: String, default: null },
    lastName: { type: String, default: null },
    email: { type: String, default: null },
    shipping: { type: Object, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

orderSchema.index(
  { paymentId: 1 },
  { unique: true, partialFilterExpression: { paymentId: { $type: 'string' } } },
)
orderSchema.index({ checkoutRequestId: 1 }, { unique: true })

orderSchema.plugin(autoIncrementPlugin)

export const OrderModel = mongoose.model<Order>('Order', orderSchema)
