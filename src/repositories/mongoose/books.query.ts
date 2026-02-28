import type { BookQuery } from '@/types'

export function bookQueryBuilder(
  q?: BookQuery,
): Record<string, unknown> | undefined {
  if (!q) return

  const filter: Record<string, unknown> = {}

  const addFilter = (key: string, value: unknown) => {
    if (value !== undefined && value !== null) {
      filter[key] = value
    }
  }

  const addRangeFilter = (
    key: string,
    gteValue?: string,
    lteValue?: string,
    parser: (val: string) => number = parseFloat,
  ) => {
    const rangeFilter: Record<string, number> = {}
    if (gteValue) rangeFilter.$gte = parser(gteValue)
    if (lteValue) rangeFilter.$lte = parser(lteValue)
    if (Object.keys(rangeFilter).length > 0) {
      filter[key] = rangeFilter
    }
  }

  if (Array.isArray(q.genre) && q.genre.length > 0) {
    addFilter('genre', { $in: q.genre })
  }

  addFilter('discount', q.discount ? parseFloat(q.discount) : undefined)
  addFilter(
    'discountPrice',
    q.discountPrice ? parseFloat(q.discountPrice) : undefined,
  )
  addFilter(
    'publishYear',
    q.publishYear ? parseInt(q.publishYear, 10) : undefined,
  )
  addFilter('newRelease', q.newRelease ? true : undefined)
  addFilter('topSellers', q.topSellers ? true : undefined)

  if (q.title) {
    addFilter('title', { $regex: q.title, $options: 'i' })
  }

  addRangeFilter('discount', q.discount_gte, q.discount_lte)
  addRangeFilter('discountPrice', q.discountPrice_gte, q.discountPrice_lte)
  addRangeFilter('publishYear', q.publishYear_gte, q.publishYear_lte, (val) =>
    parseInt(val, 10),
  )
  addRangeFilter('rating', q.rating_gte, undefined)

  return filter
}
