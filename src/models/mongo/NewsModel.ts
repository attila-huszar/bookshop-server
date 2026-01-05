import { mongo } from '@/db'
import { autoIncrementPlugin } from './'
import type { News } from '@/types'

type NewsDoc = WithDateTimestamps<News>

const newsSchema = new mongo.Schema<NewsDoc>(
  {
    id: { type: Number, unique: true, index: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    img: { type: String, required: true },
  },
  { timestamps: true },
)

newsSchema.plugin(autoIncrementPlugin)

export const NewsModel = mongo.model<NewsDoc>('News', newsSchema)
