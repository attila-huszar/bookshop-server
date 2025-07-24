import mongoose from 'mongoose'

const orderSchema = new mongoose.Schema(
  {
    paymentId: { type: String, unique: true, required: true },
    paymentIntentStatus: {
      type: String,
      default: 'processing',
      required: true,
    },
    orderStatus: { type: String, default: 'pending', required: true },
    total: { type: Number, required: true },
    currency: { type: String, required: true },
    items: { type: [mongoose.Schema.Types.Mixed], required: true }, // Array of OrderItem objects
    firstName: String,
    lastName: String,
    email: String,
    phone: String,
    address: { type: mongoose.Schema.Types.Mixed }, // Stripe.Address object
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

export const Order = mongoose.model('Order', orderSchema)
