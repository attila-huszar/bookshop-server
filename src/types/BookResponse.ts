import { books } from '../repository'

export type BookResponse =
  | (Omit<typeof books.$inferSelect, 'authorId'> & {
      author: string | null
    })
  | undefined
