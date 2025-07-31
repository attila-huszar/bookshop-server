import { model, Schema } from 'mongoose'
import { autoIncrementPlugin } from './'

const newsSchema = new Schema(
  {
    id: { type: Number, unique: true, index: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    img: String,
  },
  { timestamps: true },
)

newsSchema.plugin(autoIncrementPlugin)

export const NewsModel = model('News', newsSchema)
