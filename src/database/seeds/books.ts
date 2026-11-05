import { env } from '@/config/env'
import { calculatePriceCents, toCents } from '@/utils/pricing.utils'
import { type BookInsert, DB_REPO } from '@/types'
import booksData from './books.json'
import { seedMongo } from './mongo'
import { seedSqlite } from './sqlite'

export async function seedBooks() {
  if (env.dbRepo === DB_REPO.SQLITE) {
    const { getTableName } = await import('drizzle-orm')
    const { booksTable } = await import('@/models/sqlite')

    const seedValues: BookInsert[] = booksData.map((book) => ({
      id: book.id,
      title: book.title,
      authorId: book.author,
      genre: book.genre,
      imgUrl: book.imgUrl,
      description: book.description,
      publishYear: book.publishYear,
      rating: book.rating,
      price: toCents(book.price) / 100,
      discount: book.discount,
      discountPrice: calculatePriceCents(book.price, book.discount ?? 0) / 100,
      topSellers: book.topSellers ?? false,
      newRelease: book.newRelease ?? false,
    }))

    return {
      [getTableName(booksTable)]: await seedSqlite(booksTable, seedValues),
    }
  }

  if (env.dbRepo === DB_REPO.MONGO) {
    const { AuthorModel } = await import('@/models/mongo/AuthorModel')
    const { BookModel } = await import('@/models/mongo/BookModel')

    const authorIdMap: Record<number, string> = {}
    const authors = await AuthorModel.find()
      .select({ _id: true, id: true })
      .lean()

    for (const author of authors) {
      const id = author.id

      if (!id) {
        continue
      }

      authorIdMap[id] = author._id.toHexString()
    }

    const mongoSeedValues = booksData.map((book) => ({
      id: book.id,
      title: book.title,
      authorId: authorIdMap[book.author] ?? null,
      genre: book.genre,
      imgUrl: book.imgUrl,
      description: book.description,
      publishYear: book.publishYear,
      rating: book.rating,
      price: toCents(book.price) / 100,
      discount: book.discount,
      discountPrice: calculatePriceCents(book.price, book.discount ?? 0) / 100,
      topSellers: book.topSellers ?? false,
      newRelease: book.newRelease ?? false,
    }))

    return {
      [BookModel.collection.collectionName]: await seedMongo(
        BookModel,
        mongoSeedValues,
      ),
    }
  }
}
