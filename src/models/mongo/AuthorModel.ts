import mongoose from 'mongoose'
import { autoIncrementPlugin } from './'

const authorSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    name: { type: String, required: true },
    fullName: { type: String, default: null },
    birthYear: { type: String, default: null },
    deathYear: { type: String, default: null },
    homeland: { type: String, default: null },
    biography: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

authorSchema.plugin(autoIncrementPlugin)

export const AuthorModel = mongoose.model('Author', authorSchema)
