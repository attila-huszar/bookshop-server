import { z } from 'zod'
import type {
  authorInsertSchema,
  authorSelectSchema,
  authorUpdateSchema,
} from '@/validation'

export type Author = z.infer<typeof authorSelectSchema>
export type AuthorInsert = z.infer<typeof authorInsertSchema>
export type AuthorUpdate = z.infer<typeof authorUpdateSchema>

export type AuthorReference = Pick<Author, 'id' | 'name'>
