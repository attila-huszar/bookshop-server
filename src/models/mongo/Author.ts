import mongoose from 'mongoose'

const authorSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    fullName: String,
    birthYear: String,
    deathYear: String,
    homeland: String,
    biography: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

export const Author = mongoose.model('Author', authorSchema)
