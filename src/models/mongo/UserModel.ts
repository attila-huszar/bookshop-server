import mongoose from 'mongoose'
import { autoIncrementPlugin } from './'
import { UserRole } from '@/types'

const userSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    uuid: { type: String, unique: true, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    role: { type: String, default: UserRole.User, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    address: { type: mongoose.Schema.Types.Mixed },
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

userSchema.plugin(autoIncrementPlugin)

export const UserModel = mongoose.model('User', userSchema)
