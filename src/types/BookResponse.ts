import { booksTable } from '../db/schema'

export type BookResponse =
  | (Omit<typeof booksTable.$inferSelect, 'authorId'> & {
      author: string | null
    })
  | undefined
