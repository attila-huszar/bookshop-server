import mongoose from 'mongoose'
import { autoIncrementPlugin } from './plugins/autoIncrement'

const orderSchema = new mongoose.Schema(
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
    items: { type: [mongoose.Schema.Types.Mixed], required: true },
    firstName: String,
    lastName: String,
    email: String,
    phone: String,
    address: { type: mongoose.Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

orderSchema.plugin(autoIncrementPlugin)

export const OrderModel = mongoose.model('Order', orderSchema)
