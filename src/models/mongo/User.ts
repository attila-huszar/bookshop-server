import mongoose from 'mongoose'
import { UserRole } from '@/types'

const userSchema = new mongoose.Schema(
  {
    uuid: { type: String, unique: true, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    role: { type: String, default: UserRole.User, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    address: { type: mongoose.Schema.Types.Mixed }, // Stripe.Address object
    phone: String,
    avatar: String,
    verified: { type: Boolean, default: false, required: true },
    verificationToken: String,
    verificationExpires: String,
    passwordResetToken: String,
    passwordResetExpires: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

export const User = mongoose.model('User', userSchema)
