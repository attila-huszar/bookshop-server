import { mongo } from '@/db'
import { autoIncrementPlugin } from './'
import type { NewsSQL, WithDateTimestamps } from '@/models/sqlite'

type INews = WithDateTimestamps<NewsSQL>

const newsSchema = new mongo.Schema<INews>(
  {
    id: { type: Number, unique: true, index: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    img: { type: String, default: null },
  },
  { timestamps: true },
)

newsSchema.plugin(autoIncrementPlugin)

export const NewsModel = mongo.model<INews>('News', newsSchema)
