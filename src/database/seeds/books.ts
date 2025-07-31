import { env } from '@/config'
import { DB_REPO } from '@/constants'
import booksData from './books.json'
import type { BookInsertSQL } from '@/types'

export async function seedBooks() {
  if (env.dbRepo === DB_REPO.SQLITE) {
    const { drizzle: _drizzle } = await import('drizzle-orm/bun-sqlite')
    const { getTableName } = await import('drizzle-orm')
    const { booksTable } = await import('@/models/sqlite')
    const { db } = await import('@/db')
    const drizzleDb = db as ReturnType<typeof _drizzle>

    const seedValues: BookInsertSQL[] = booksData.map((book) => {
      const discountPrice = book.discount
        ? book.price - (book.price * book.discount) / 100
        : book.price

      return {
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
        discountPrice,
        topSellers: book.topSellers ?? false,
        newRelease: book.newRelease ?? false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    })

    await drizzleDb.insert(booksTable).values(seedValues)

    return {
      [getTableName(booksTable)]: seedValues.length,
    }
  }

  if (env.dbRepo === DB_REPO.MONGO) {
    const { AuthorModel, BookModel, getHighestId, setSequence } = await import(
      '@/models/mongo'
    )

    const authorIdMap: Record<number, string> = {}
    const authors = await AuthorModel.find()
      .select({ _id: true, id: true })
      .lean()

    authors.forEach((author) => {
      const id = author.id
      if (!id) return
      authorIdMap[id] = author._id as unknown as string
    })

    const mongoSeedValues = booksData.map((book) => {
      const discountPrice = book.discount
        ? book.price - (book.price * book.discount) / 100
        : book.price

      return {
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
        discountPrice,
        topSellers: book.topSellers ?? false,
        newRelease: book.newRelease ?? false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    })

    await BookModel.create(mongoSeedValues)
    const highestId = await getHighestId(BookModel)
    await setSequence(BookModel, highestId)

    return {
      [BookModel.collection.collectionName]: mongoSeedValues.length,
    }
  }
}
