import { z } from 'zod'
import { PAGINATION } from '@/constants'
import { idSchema } from './commonSchemas'

const numericQuery = z
  .union([z.number(), z.string().regex(/^\d+(\.\d+)?$/)])
  .pipe(z.coerce.number<string | number>().nonnegative())

const booleanQuery = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
])

export const bookQuerySchema = z
  .object({
    id: idSchema.optional(),
    authorId: idSchema.optional(),
    page: idSchema.pipe(z.number().max(PAGINATION.MAX_PAGE)).optional(),
    limit: idSchema.pipe(z.number().max(PAGINATION.MAX_LIMIT)).optional(),
    genre: z
      .union([z.string().trim().min(1), z.array(z.string().trim().min(1))])
      .transform((value) => (typeof value === 'string' ? [value] : value))
      .optional(),
    title: z.string().trim().min(1).max(100).optional(),
    newRelease: booleanQuery.optional(),
    topSellers: booleanQuery.optional(),
    discount: numericQuery.pipe(z.number().max(100)).optional(),
    discount_gte: numericQuery.pipe(z.number().max(100)).optional(),
    discount_lte: numericQuery.pipe(z.number().max(100)).optional(),
    discountPrice: numericQuery.optional(),
    discountPrice_gte: numericQuery.optional(),
    discountPrice_lte: numericQuery.optional(),
    publishYear: idSchema.optional(),
    publishYear_gte: idSchema.optional(),
    publishYear_lte: idSchema.optional(),
    rating: numericQuery.pipe(z.number().min(1).max(5)).optional(),
    rating_gte: numericQuery.pipe(z.number().min(1).max(5)).optional(),
    rating_lte: numericQuery.pipe(z.number().min(1).max(5)).optional(),
  })
  .refine(
    (value) =>
      ['discount', 'discountPrice', 'publishYear', 'rating'].every((key) => {
        const min = value[`${key}_gte` as keyof typeof value]
        const max = value[`${key}_lte` as keyof typeof value]
        return typeof min !== 'number' || typeof max !== 'number' || min <= max
      }),
    'Minimum filter value must not exceed maximum',
  )
