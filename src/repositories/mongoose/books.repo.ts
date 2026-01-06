import model from '@/models'
import type {
  BookDocPopulatedWithAuthorName,
  BookDocPopulatedWithAuthorId,
} from '@/models/mongo/BookModel'
import { mongoQueryBuilder } from '@/utils'
import { PAGINATION } from '@/constants'
import type {
  Book,
  BookQuery,
  BookInsert,
  BookUpdate,
  BookWithAuthor,
} from '@/types'

type AggregateResult = {
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
    .lean<BookDocPopulatedWithAuthorName[]>()

  const booksWithAuthor: BookWithAuthor[] = booksRecords.map((book) => ({
    ...book,
    author: book.authorId?.name ?? null,
    createdAt: book.createdAt.toISOString(),
    updatedAt: book.updatedAt.toISOString(),
  }))

  return { booksRecords: booksWithAuthor, booksCount: booksCount.toString() }
}

export async function getBookById(
  bookId: number,
): Promise<BookWithAuthor | null> {
  const book = await BookModel.findOne({ id: bookId })
    .populate('authorId', 'name')
    .lean<BookDocPopulatedWithAuthorName>()

  if (!book) return null
  const author = book?.authorId?.name ?? null

  return {
    ...book,
    author,
    createdAt: book.createdAt.toISOString(),
    updatedAt: book.updatedAt.toISOString(),
  }
}

export async function getBookSearchOptions(): Promise<{
  genre: string[]
  price: [number, number]
  publishYear: [number, number]
}> {
  const prices = await BookModel.aggregate<AggregateResult>([
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
  const books = await BookModel.find()
    .populate('authorId', 'id')
    .lean<BookDocPopulatedWithAuthorId[]>()

  return books.map((book) => {
    const authorId = book.authorId?.id
    if (authorId == null) {
      throw new Error(`Book ${book.id} has no authorId`)
    }
    return {
      ...book,
      authorId,
      createdAt: book.createdAt.toISOString(),
      updatedAt: book.updatedAt.toISOString(),
    }
  })
}

export async function insertBook(book: BookInsert): Promise<Book> {
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

  const bookWithAuthor = {
    ...book,
    authorId: authorObjectId,
  }

  const { id, createdAt, updatedAt, ...bookData } = bookWithAuthor

  const created = await BookModel.create(bookData)
  const bookObj = created.toObject()
  return {
    ...bookObj,
    authorId: book.authorId,
    createdAt: bookObj.createdAt.toISOString(),
    updatedAt: bookObj.updatedAt.toISOString(),
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
  })
    .populate('authorId', 'id')
    .lean<BookDocPopulatedWithAuthorId>()

  if (!updated) return null

  const authorId = updated.authorId?.id
  if (authorId == null) {
    throw new Error(`Book ${bookId} has no authorId`)
  }

  return {
    ...updated,
    authorId,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  }
}

export async function deleteBooks(bookIds: number[]): Promise<Book['id'][]> {
  await BookModel.deleteMany({ id: { $in: bookIds } })
  return bookIds
}
