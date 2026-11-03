import { z } from 'zod'
import { PAGINATION } from '@/constants/pagination'
import { validationLimits } from '@/constants/validation'
import { ValidationRule } from '@/types/enums'
import { idSchema } from './commonSchemas'

const numericQuery = z
  .union([z.number(), z.string().regex(/^\d+(\.\d+)?$/)])
  .pipe(z.coerce.number<string | number>().nonnegative())

const booleanQuery = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
])

const discountQuery = numericQuery
  .pipe(z.number().max(validationLimits.discountMaxPercent))
  .optional()

const ratingQuery = numericQuery
  .pipe(
    z
      .number()
      .min(validationLimits.book.ratingMin)
      .max(validationLimits.book.ratingMax),
  )
  .optional()

const genreQuery = z.string().trim().min(1)

const rangeFields = [
  'discount',
  'discountPrice',
  'publishYear',
  'rating',
] as const

export const bookQuerySchema = z
  .object({
    id: idSchema.optional(),
    authorId: idSchema.optional(),
    page: idSchema.pipe(z.number().max(PAGINATION.MAX_PAGE)).optional(),
    limit: idSchema.pipe(z.number().max(PAGINATION.MAX_LIMIT)).optional(),
    genre: z
      .union([genreQuery, z.array(genreQuery)])
      .transform((value) => (typeof value === 'string' ? [value] : value))
      .optional(),
    title: z
      .string()
      .trim()
      .min(1)
      .max(validationLimits.book.titleMaxLength)
      .optional(),
    newRelease: booleanQuery.optional(),
    topSellers: booleanQuery.optional(),
    recommended: booleanQuery.optional(),
    discount: discountQuery,
    discount_gte: discountQuery,
    discount_lte: discountQuery,
    discountPrice: numericQuery.optional(),
    discountPrice_gte: numericQuery.optional(),
    discountPrice_lte: numericQuery.optional(),
    publishYear: idSchema.optional(),
    publishYear_gte: idSchema.optional(),
    publishYear_lte: idSchema.optional(),
    rating: ratingQuery,
    rating_gte: ratingQuery,
    rating_lte: ratingQuery,
  })
  .refine(
    (value) =>
      rangeFields.every((field) => {
        const min = value[`${field}_gte`]
        const max = value[`${field}_lte`]

        return min === undefined || max === undefined || min <= max
      }),
    {
      message: 'Minimum filter value must not exceed maximum',
      params: { rule: ValidationRule.FilterRange },
    },
  )

export const bookSearchSchema = z.object({
  q: z
    .string()
    .trim()
    .min(validationLimits.search.minLength)
    .max(validationLimits.search.maxLength),
})
