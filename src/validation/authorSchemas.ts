import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod'
import { z } from 'zod'
import { authorsTable } from '@/models/sqlite'
import type { SchemaRefinements } from '@/types'

export const authorSelectSchema = createSelectSchema(authorsTable)

const authorFields = {
  name: z.string().trim().min(2).max(50),
  fullName: z.string().trim().min(2).max(100).or(z.literal('')),
  homeland: z.string().trim().min(2).max(50).or(z.literal('')),
  biography: z.string().trim().min(10).max(500).or(z.literal('')),
  birthYear: z
    .string()
    .regex(/^[1-9]\d*$/, 'Invalid year')
    .or(z.literal('')),
  deathYear: z
    .string()
    .regex(/^[1-9]\d*$/, 'Invalid year')
    .or(z.literal('')),
} satisfies SchemaRefinements<typeof authorsTable.$inferInsert>

export const authorInsertSchema = createInsertSchema(
  authorsTable,
  authorFields,
).omit({ id: true, createdAt: true, updatedAt: true })

export const authorUpdateSchema = createUpdateSchema(authorsTable, {
  name: authorFields.name.optional(),
  fullName: authorFields.fullName.optional(),
  homeland: authorFields.homeland.optional(),
  biography: authorFields.biography.optional(),
  birthYear: authorFields.birthYear.optional(),
  deathYear: authorFields.deathYear.optional(),
} satisfies SchemaRefinements<Partial<typeof authorsTable.$inferInsert>>).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
