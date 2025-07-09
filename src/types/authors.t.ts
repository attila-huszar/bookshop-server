import { authorsTable } from '../repositories'

export type Author = typeof authorsTable.$inferSelect

export type AuthorResponse = Pick<
  typeof authorsTable.$inferSelect,
  'id' | 'name'
>
