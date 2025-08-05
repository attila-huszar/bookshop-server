import model from '@/models'
import { mongoQueryBuilder } from '@/utils'
import { PAGINATION } from '@/constants'
import type {
  Book,
  BookQuery,
  BookCreate,
  BookUpdate,
  BookWithAuthor,
} from '@/types'

type _AggregateResult = {
  _id: null
  minPrice: number
  maxPrice: number
  minYear: number
  maxYear: number
}

const { BookModel, AuthorModel } = model as MongoModel

export async function getBooks(query?: BookQuery): Promise<{
  booksRecords: BookWithAuthor[]
  booksCount: string
}> {
  const page = Math.min(
    Math.max(1, Number(query?.page) || 1),
    PAGINATION.MAX_PAGE,
  )
  const limit = Math.min(
    Math.max(1, Number(query?.limit) || PAGINATION.DEFAULT_LIMIT),
    PAGINATION.MAX_LIMIT,
  )
  const offset = (page - 1) * limit

  let filter = mongoQueryBuilder(query)

  if (query?.authorId) {
    const author = await AuthorModel.findOne({ id: query.authorId })
      .select({ _id: true })
      .lean()

    if (!author) {
      return { booksRecords: [], booksCount: '0' }
    }

    filter = { ...filter, authorId: author._id }
  }

  const booksCount = await BookModel.countDocuments(filter ?? {})
  const booksRecords = await BookModel.find(filter ?? {})
    .populate('authorId', 'name')
    .skip(offset)
    .limit(limit)
    .lean()
  const mapped: BookWithAuthor[] = booksRecords.map((book) => {
    const populatedAuthor = book.authorId as
      | { _id: string; name: string }
      | undefined
    return {
      id: book.id!,
      title: book.title,
      author: populatedAuthor?.name ?? null,
      genre: book.genre ?? null,
      imgUrl: book.imgUrl ?? null,
      description: book.description ?? null,
      publishYear: book.publishYear ?? null,
      rating: book.rating ?? null,
      price: book.price,
      discount: book.discount ?? null,
      discountPrice: book.discountPrice,
      topSellers: book.topSellers ?? null,
      newRelease: book.newRelease ?? null,
      createdAt: book.createdAt.toISOString(),
      updatedAt: book.updatedAt.toISOString(),
    }
  })

  return { booksRecords: mapped, booksCount: booksCount.toString() }
}

export async function getBookById(
  bookId: number,
): Promise<BookWithAuthor | null> {
  const book = await BookModel.findOne({ id: bookId })
    .populate('authorId', 'name')
    .lean()

  if (!book) return null

  const populatedAuthor = book.authorId as
    | { _id: string; name: string }
    | undefined

  return {
    id: book.id!,
    title: book.title,
    author: populatedAuthor?.name ?? null,
    genre: book.genre ?? null,
    imgUrl: book.imgUrl ?? null,
    description: book.description ?? null,
    publishYear: book.publishYear ?? null,
    rating: book.rating ?? null,
    price: book.price,
    discount: book.discount ?? null,
    discountPrice: book.discountPrice,
    topSellers: book.topSellers ?? null,
    newRelease: book.newRelease ?? null,
    createdAt: book.createdAt.toISOString(),
    updatedAt: book.updatedAt.toISOString(),
  }
}

export async function getBookSearchOptions(): Promise<{
  genre: string[]
  price: [number, number]
  publishYear: [number, number]
}> {
  const prices = await BookModel.aggregate<_AggregateResult>([
    {
      $group: {
        _id: null,
        minPrice: { $min: '$discountPrice' },
        maxPrice: { $max: '$discountPrice' },
        minYear: { $min: '$publishYear' },
        maxYear: { $max: '$publishYear' },
      },
    },
  ])
  const genres = await BookModel.distinct('genre')
  const minMax = prices[0]
  return {
    price: [minMax?.minPrice ?? 0, minMax?.maxPrice ?? 500],
    publishYear: [
      minMax?.minYear ?? 1000,
      minMax?.maxYear ?? new Date().getFullYear(),
    ],
    genre: genres.filter((g): g is string => g != null),
  }
}

export async function getAllBooks(): Promise<Book[]> {
  const books = await BookModel.find().populate('authorId', 'id').lean()

  return books.map((book) => {
    const populatedAuthor = book.authorId as { id: number } | undefined

    return {
      id: book.id!,
      title: book.title,
      authorId: populatedAuthor?.id ?? null,
      genre: book.genre ?? null,
      imgUrl: book.imgUrl ?? null,
      description: book.description ?? null,
      publishYear: book.publishYear ?? null,
      rating: book.rating ?? null,
      price: book.price,
      discount: book.discount ?? null,
      discountPrice: book.discountPrice,
      topSellers: book.topSellers ?? null,
      newRelease: book.newRelease ?? null,
      createdAt: book.createdAt.toISOString(),
      updatedAt: book.updatedAt.toISOString(),
    }
  })
}

export async function insertBook(book: BookCreate): Promise<Book> {
  let authorObjectId = null
  if (book.authorId) {
    const author = await AuthorModel.findOne({ id: book.authorId })
      .select('_id')
      .lean()
    if (!author) {
      throw new Error(`Author with id ${book.authorId} not found`)
    }
    authorObjectId = author._id
  }

  const bookData = {
    ...book,
    authorId: authorObjectId,
  }

  const created = await BookModel.create(bookData)
  const savedBook = created.toObject()

  return {
    id: savedBook.id!,
    title: savedBook.title,
    genre: savedBook.genre ?? null,
    imgUrl: savedBook.imgUrl ?? null,
    description: savedBook.description ?? null,
    publishYear: savedBook.publishYear ?? null,
    rating: savedBook.rating ?? null,
    price: savedBook.price,
    discount: savedBook.discount ?? null,
    discountPrice: savedBook.discountPrice,
    topSellers: savedBook.topSellers ?? null,
    newRelease: savedBook.newRelease ?? null,
    authorId: book.authorId ?? null,
    createdAt: savedBook.createdAt.toISOString(),
    updatedAt: savedBook.updatedAt.toISOString(),
  }
}

export async function updateBook(
  bookId: number,
  book: BookUpdate,
): Promise<Book | null> {
  const updateData: Record<string, unknown> = { ...book }
  if (book.authorId !== undefined) {
    if (book.authorId === null) {
      updateData.authorId = null
    } else {
      const author = await AuthorModel.findOne({ id: book.authorId })
        .select('_id')
        .lean()
      if (!author) {
        throw new Error(`Author with id ${book.authorId} not found`)
      }
      updateData.authorId = author._id
    }
  }

  const updated = await BookModel.findOneAndUpdate({ id: bookId }, updateData, {
    new: true,
  }).lean()

  if (!updated) return null

  return {
    id: updated.id!,
    title: updated.title,
    genre: updated.genre ?? null,
    imgUrl: updated.imgUrl ?? null,
    description: updated.description ?? null,
    publishYear: updated.publishYear ?? null,
    rating: updated.rating ?? null,
    price: updated.price,
    discount: updated.discount ?? null,
    discountPrice: updated.discountPrice,
    topSellers: updated.topSellers ?? null,
    newRelease: updated.newRelease ?? null,
    authorId: book.authorId ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  }
}

export async function deleteBooks(bookIds: number[]): Promise<Book['id'][]> {
  await BookModel.deleteMany({ id: { $in: bookIds } })

  return bookIds
}
