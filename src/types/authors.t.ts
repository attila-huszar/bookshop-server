import { z } from 'zod'
import type {
  authorSchema,
  authorCreateSchema,
  authorUpdateSchema,
} from '@/validation'
import type { authorsTable } from '@/models/sqlite'

export type AuthorInsert = typeof authorsTable.$inferInsert

export type Author = z.infer<typeof authorSchema>
export type AuthorCreate = z.infer<typeof authorCreateSchema>
export type AuthorUpdate = z.infer<typeof authorUpdateSchema>

export type AuthorReference = Pick<Author, 'id' | 'name'>
