import { mongo } from '@/db'
import { autoIncrementPlugin } from './'
import type { Order, StripeStatus } from '@/types'
import { OrderStatus } from '@/types'

type OrderDoc = WithDateTimestamps<Order>

const orderSchema = new mongo.Schema<OrderDoc>(
  {
    id: { type: Number, unique: true, index: true },
    paymentId: { type: String, unique: true, required: true },
    paymentIntentStatus: {
      type: String,
      default: 'processing' as StripeStatus,
      required: true,
    },
    orderStatus: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.Pending,
      required: true,
    },
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

export const OrderModel = mongo.model<OrderDoc>('Order', orderSchema)
