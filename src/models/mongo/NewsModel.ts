import { mongo } from '@/db'
import { autoIncrementPlugin } from './'

const newsSchema = new mongo.Schema(
  {
    id: { type: Number, unique: true, index: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    img: String,
  },
  { timestamps: true },
)

newsSchema.plugin(autoIncrementPlugin)

export const NewsModel = mongo.model('News', newsSchema)
