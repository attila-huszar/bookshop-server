import mongoose from 'mongoose'

const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Author' },
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
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

export const Book = mongoose.model('Book', bookSchema)
