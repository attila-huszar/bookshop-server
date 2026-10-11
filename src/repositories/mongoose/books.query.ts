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
    gteValue?: number,
    lteValue?: number,
  ) => {
    const rangeFilter: Record<string, number> = {}
    if (gteValue !== undefined) rangeFilter.$gte = gteValue
    if (lteValue !== undefined) rangeFilter.$lte = lteValue
    if (Object.keys(rangeFilter).length > 0) {
      filter[key] = rangeFilter
    }
  }

  if (Array.isArray(q.genre) && q.genre.length > 0) {
    addFilter('genre', { $in: q.genre })
  }

  addFilter('discount', q.discount)
  addFilter('discountPrice', q.discountPrice)
  addFilter('publishYear', q.publishYear)
  addFilter('rating', q.rating)
  addFilter('newRelease', q.newRelease)
  addFilter('topSellers', q.topSellers)

  if (q.title) {
    addFilter('title', {
      $regex: q.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      $options: 'i',
    })
  }

  addRangeFilter('discount', q.discount_gte, q.discount_lte)
  addRangeFilter('discountPrice', q.discountPrice_gte, q.discountPrice_lte)
  addRangeFilter('publishYear', q.publishYear_gte, q.publishYear_lte)
  addRangeFilter('rating', q.rating_gte, q.rating_lte)

  return filter
}
