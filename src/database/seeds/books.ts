import { env } from '@/config'
import { DB_REPO } from '@/constants'
import type { BookInsert } from '@/types'
import booksData from './books.json'

function calculateDiscountPrice(
  price: number,
  discount: number | null,
): number {
  return discount ? price - (price * discount) / 100 : price
}

export async function seedBooks() {
  if (env.dbRepo === DB_REPO.SQLITE) {
    const { getTableName } = await import('drizzle-orm')
    const { booksTable } = await import('@/models/sqlite')
    const { db } = await import('@/db')

    const seedValues: BookInsert[] = booksData.map((book) => ({
      id: book.id,
      title: book.title,
      authorId: book.author,
      genre: book.genre,
      imgUrl: book.imgUrl,
      description: book.description,
      publishYear: book.publishYear,
      rating: book.rating,
      price: book.price,
      discount: book.discount,
      discountPrice: calculateDiscountPrice(book.price, book.discount),
      topSellers: book.topSellers ?? false,
      newRelease: book.newRelease ?? false,
    }))

    await db.insert(booksTable).values(seedValues)

    return {
      [getTableName(booksTable)]: seedValues.length,
    }
  }

  if (env.dbRepo === DB_REPO.MONGO) {
    const { AuthorModel, BookModel, getHighestId, setSequence } =
      await import('@/models/mongo')

    const authorIdMap: Record<number, string> = {}
    const authors = await AuthorModel.find()
      .select({ _id: true, id: true })
      .lean()

    authors.forEach((author) => {
      const id = author.id
      if (!id) return
      authorIdMap[id] = author._id.toHexString()
    })

    const mongoSeedValues = booksData.map((book) => ({
      id: book.id,
      title: book.title,
      authorId: authorIdMap[book.author] ?? null,
      genre: book.genre,
      imgUrl: book.imgUrl,
      description: book.description,
      publishYear: book.publishYear,
      rating: book.rating,
      price: book.price,
      discount: book.discount,
      discountPrice: calculateDiscountPrice(book.price, book.discount),
      topSellers: book.topSellers ?? false,
      newRelease: book.newRelease ?? false,
    }))

    await BookModel.create(mongoSeedValues)
    const highestId = await getHighestId(BookModel)
    await setSequence(BookModel, highestId)

    return {
      [BookModel.collection.collectionName]: mongoSeedValues.length,
    }
  }
}
