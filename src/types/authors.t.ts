import { z } from 'zod'
import { authorsTable } from '../repositories'
import type {
  authorSchema,
  authorCreateSchema,
  authorUpdateSchema,
} from '../validation'

export type Author = z.infer<typeof authorSchema>
export type AuthorCreate = z.infer<typeof authorCreateSchema>
export type AuthorUpdate = z.infer<typeof authorUpdateSchema>

export type AuthorResponse = Pick<
  typeof authorsTable.$inferSelect,
  'id' | 'name'
>
