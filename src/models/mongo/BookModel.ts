import { mongo } from '@/db'
import { autoIncrementPlugin } from './'

const bookSchema = new mongo.Schema(
  {
    id: { type: Number, unique: true, index: true },
    title: { type: String, required: true },
    authorId: { type: mongo.Schema.Types.ObjectId, ref: 'Author' },
    genre: String,
    imgUrl: String,
    description: String,
    publishYear: Number,
    rating: Number,
    price: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    discountPrice: { type: Number, required: true },
    topSellers: { type: Boolean, default: false },
    newRelease: { type: Boolean, default: false },
  },
  { timestamps: true },
)

bookSchema.plugin(autoIncrementPlugin)

export const BookModel = mongo.model('Book', bookSchema)
