import { mongo } from '@/db'
import { autoIncrementPlugin } from './'
import type { Types } from 'mongoose'
import type { Book } from '@/types'

export type BookDoc = WithDateTimestamps<Omit<Book, 'authorId'>> & {
  authorId: Types.ObjectId | null
}

export type BookDocPopulatedWithAuthorName = Omit<BookDoc, 'authorId'> & {
  authorId: { _id: Types.ObjectId; name: string } | null
}

export type BookDocPopulatedWithAuthorId = Omit<BookDoc, 'authorId'> & {
  authorId: { _id: Types.ObjectId; id: number } | null
}

const bookSchema = new mongo.Schema<BookDoc>(
  {
    id: { type: Number, unique: true, index: true },
    title: { type: String, required: true },
    authorId: {
      type: mongo.Schema.Types.ObjectId,
      ref: 'Author',
      default: null,
    },
    genre: { type: String, default: null },
    imgUrl: { type: String, default: null },
    description: { type: String, default: null },
    publishYear: { type: Number, default: null },
    rating: { type: Number, default: null },
    price: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    discountPrice: { type: Number, required: true },
    topSellers: { type: Boolean, default: false },
    newRelease: { type: Boolean, default: false },
  },
  { timestamps: true },
)

bookSchema.plugin(autoIncrementPlugin)

export const BookModel = mongo.model<BookDoc>('Book', bookSchema)
