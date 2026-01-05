import { mongo } from '@/db'
import { autoIncrementPlugin } from './'
import { UserRole } from '@/types'

const userSchema = new mongo.Schema(
  {
    id: { type: Number, unique: true, index: true },
    uuid: { type: String, unique: true, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    role: { type: String, default: UserRole.User, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    address: { type: Object, required: true },
    phone: { type: String, required: true },
    country: { type: String, required: true },
    avatar: { type: String, required: true },
    verified: { type: Boolean, default: false, required: true },
    verificationToken: { type: String, required: true },
    verificationExpires: { type: String, required: true },
    passwordResetToken: { type: String, required: true },
    passwordResetExpires: { type: String, required: true },
  },
  { timestamps: true },
)

userSchema.plugin(autoIncrementPlugin)

export const UserModel = mongo.model('User', userSchema)
