import { authorsTable } from '../repositories'

export type AuthorResponse = Pick<
  typeof authorsTable.$inferSelect,
  'id' | 'name'
>
