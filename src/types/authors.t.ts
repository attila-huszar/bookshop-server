import { authors } from '../repository'

export type AuthorResponse = Pick<typeof authors.$inferSelect, 'id' | 'name'>
