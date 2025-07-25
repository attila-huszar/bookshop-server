import mongoose from 'mongoose'
import { autoIncrementPlugin } from './plugins/autoIncrement'

const newsSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    img: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

newsSchema.plugin(autoIncrementPlugin)

export const NewsModel = mongoose.model('News', newsSchema)
