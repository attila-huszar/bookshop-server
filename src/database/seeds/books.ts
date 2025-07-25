import { getTableName } from 'drizzle-orm'
import { db } from '@/db'
import { booksTable } from '@/models/sqlite'
import { AuthorModel, BookModel } from '@/models/mongo'
import { env } from '@/config'
import { DB_REPO } from '@/constants'
import type { BookInsertSQL } from '@/types'
import booksData from './books.json'

export async function seedBooks() {
  const authorIdMap: Record<number, string> = {}
  const authors = await AuthorModel.find()

  authors.forEach((author) => {
    const id = author.id as number
    if (!id) return
    authorIdMap[id] = author._id.toString()
  })

  const seedValues = booksData.map((book) => {
    const discountPrice = book.discount
      ? book.price - (book.price * book.discount) / 100
      : book.price

    return {
      title: book.title,
      authorId:
        env.dbRepo === DB_REPO.MONGO ? authorIdMap[book.author] : book.author,
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

  if (env.dbRepo === DB_REPO.SQLITE) {
    await db.insert(booksTable).values(seedValues as BookInsertSQL[])

    return {
      [getTableName(booksTable)]: seedValues.length,
    }
  }

  if (env.dbRepo === DB_REPO.MONGO) {
    await BookModel.create(seedValues)

    return {
      [BookModel.collection.collectionName]: seedValues.length,
    }
  }
}
