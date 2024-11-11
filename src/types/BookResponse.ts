import { booksTable } from '../database/schema'

export type BookResponse =
  | (Omit<typeof booksTable.$inferSelect, 'authorId'> & {
      author: string | null
    })
  | undefined
