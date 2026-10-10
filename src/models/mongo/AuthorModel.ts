import mongoose from 'mongoose'
import type { Author } from '@/types'
import { autoIncrementPlugin } from './'

const authorSchema = new mongoose.Schema<Author>(
  {
    id: { type: Number, unique: true, index: true },
    name: { type: String, required: true },
    fullName: { type: String, default: '' },
    birthYear: { type: String, default: '' },
    deathYear: { type: String, default: '' },
    homeland: { type: String, default: '' },
    biography: { type: String, default: '' },
  },
  { timestamps: true },
)

authorSchema.plugin(autoIncrementPlugin)

export const AuthorModel = mongoose.model<Author>('Author', authorSchema)
