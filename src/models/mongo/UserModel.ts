import { mongo } from '@/db'
import { type User, UserRole } from '@/types'
import { autoIncrementPlugin } from './'

const userSchema = new mongo.Schema<User>(
  {
    id: { type: Number, unique: true, index: true, required: true },
    uuid: { type: String, unique: true, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.User,
      required: true,
    },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    address: { type: Object, default: null },
    phone: { type: String, default: null },
    country: { type: String, required: true },
    avatar: { type: String, default: null },
    verified: { type: Boolean, default: false, required: true },
    verificationToken: { type: String, default: null },
    verificationExpires: { type: Date, default: null },
    passwordResetToken: { type: String, default: null },
    passwordResetExpires: { type: Date, default: null },
  },
  { timestamps: true },
)

userSchema.plugin(autoIncrementPlugin)

export const UserModel = mongo.model<User>('User', userSchema)
