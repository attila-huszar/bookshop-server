import { model, Schema } from 'mongoose'
import { autoIncrementPlugin } from './'

const orderSchema = new Schema(
  {
    id: { type: Number, unique: true, index: true },
    paymentId: { type: String, unique: true, required: true },
    paymentIntentStatus: {
      type: String,
      default: 'processing',
      required: true,
    },
    orderStatus: { type: String, default: 'pending', required: true },
    total: { type: Number, required: true },
    currency: { type: String, required: true },
    items: { type: [Schema.Types.Mixed], required: true },
    firstName: String,
    lastName: String,
    email: String,
    phone: String,
    address: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
)

orderSchema.plugin(autoIncrementPlugin)

export const OrderModel = model('Order', orderSchema)
