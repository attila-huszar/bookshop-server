import mongoose from 'mongoose'
import type { News } from '@/types'
import { autoIncrementPlugin } from './'

const newsSchema = new mongoose.Schema<News>(
  {
    id: { type: Number, unique: true, index: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    img: { type: String, required: true },
  },
  { timestamps: true },
)

newsSchema.plugin(autoIncrementPlugin)

export const NewsModel = mongoose.model<News>('News', newsSchema)
