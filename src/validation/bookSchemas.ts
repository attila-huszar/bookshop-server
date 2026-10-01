import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod'
import { z } from 'zod'
import { booksTable } from '@/models/sqlite'
import type { SchemaRefinements } from '@/types'
import { idSchema } from './commonSchemas'

export const bookSelectSchema = createSelectSchema(booksTable)
const bookFields = {
  title: z.string().trim().min(2).max(100),
  authorId: idSchema,
  genre: z.string().trim().min(2).max(50),
  imgUrl: z.url(),
  description: z.string().trim().min(10).max(500),
  publishYear: z.int().positive(),
  rating: z
    .number()
    .min(1)
    .max(5)
    .refine(
      (value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-8,
      'Max 1 decimal',
    ),
  price: z.number().positive(),
  discount: z.int().min(0).max(100),
  discountPrice: z.number().nonnegative(),
} satisfies SchemaRefinements<typeof booksTable.$inferInsert>

export const bookInsertSchema = createInsertSchema(booksTable, bookFields).omit(
  { id: true, createdAt: true, updatedAt: true },
)

export const bookUpdateSchema = createUpdateSchema(booksTable, {
  title: bookFields.title.optional(),
  authorId: idSchema.optional(),
  genre: bookFields.genre.optional(),
  imgUrl: bookFields.imgUrl.optional(),
  description: bookFields.description.optional(),
  publishYear: bookFields.publishYear.optional(),
  rating: bookFields.rating.optional(),
  price: bookFields.price.optional(),
  discount: bookFields.discount.optional(),
  discountPrice: bookFields.discountPrice.optional(),
} satisfies SchemaRefinements<Partial<typeof booksTable.$inferInsert>>).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
