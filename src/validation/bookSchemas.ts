import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod'
import { z } from 'zod'
import { booksTable } from '@/models/sqlite'
import { toCents } from '@/utils/pricing.utils'
import { validationLimits } from '@/constants/validation'
import type { SchemaRefinements } from '@/types'
import { ValidationRule } from '@/types/enums'
import { idSchema } from './commonSchemas'

export const bookSelectSchema = createSelectSchema(booksTable)
const bookFields = {
  title: z
    .string()
    .trim()
    .min(validationLimits.book.titleMinLength)
    .max(validationLimits.book.titleMaxLength),
  authorId: idSchema,
  genre: z
    .string()
    .trim()
    .min(validationLimits.book.genreMinLength)
    .max(validationLimits.book.genreMaxLength),
  imgUrl: z.url(),
  description: z
    .string()
    .trim()
    .min(validationLimits.book.descriptionMinLength)
    .max(validationLimits.book.descriptionMaxLength),
  publishYear: z.int().positive(),
  rating: z
    .number()
    .min(validationLimits.book.ratingMin)
    .max(validationLimits.book.ratingMax)
    .refine((value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-8, {
      message: 'Max 1 decimal',
      params: { rule: ValidationRule.Decimal },
    }),
  price: z
    .number()
    .positive()
    .transform((price) => toCents(price) / 100)
    .pipe(z.number().positive()),
  discount: z.int().min(0).max(validationLimits.discountMaxPercent),
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
