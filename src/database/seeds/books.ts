import { getTableName } from 'drizzle-orm'
import { Types } from 'mongoose'
import { db } from '@/db'
import { booksTable } from '@/models/sqlite'
import {
  AuthorModel,
  BookModel,
  getHighestId,
  setSequence,
} from '@/models/mongo'
import { env } from '@/config'
import { DB_REPO } from '@/constants'
import type { BookInsertSQL } from '@/types'
import booksData from './books.json'

export async function seedBooks() {
  const authorIdMap: Record<number, Types.ObjectId> = {}
  const authors = await AuthorModel.find()
    .select({ _id: true, id: true })
    .lean()

  authors.forEach((author) => {
    const id = author.id
    if (!id) return
    authorIdMap[id] = author._id
  })

  const seedValues = booksData.map((book) => {
    const discountPrice = book.discount
      ? book.price - (book.price * book.discount) / 100
      : book.price

    const getAuthorId = () => {
      if (env.dbRepo === DB_REPO.MONGO) {
        const authorObjectId = authorIdMap[book.author]
        if (!authorObjectId) {
          console.warn(
            `No author found for book "${book.title}" with author ID ${book.author}`,
          )
          return null
        }
        return authorObjectId
      }
      return book.author
    }

    return {
      id: book.id,
      title: book.title,
      authorId: getAuthorId(),
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
    const highestId = await getHighestId(BookModel)
    await setSequence(BookModel, highestId)

    return {
      [BookModel.collection.collectionName]: seedValues.length,
    }
  }
}
