import { mongo } from '@/db'
import type { Order } from '@/types'
import { autoIncrementPlugin } from './'

const orderSchema = new mongo.Schema<Order>(
  {
    id: { type: Number, unique: true, index: true },
    paymentId: { type: String, unique: true, required: true },
    paymentStatus: { type: String, default: 'processing', required: true },
    total: { type: Number, required: true },
    currency: { type: String, required: true },
    items: { type: [Object], required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    shipping: { type: Object, required: true },
  },
  { timestamps: true },
)

orderSchema.plugin(autoIncrementPlugin)

export const OrderModel = mongo.model<Order>('Order', orderSchema)
