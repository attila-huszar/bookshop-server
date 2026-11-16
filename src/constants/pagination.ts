export const PAGINATION = {
  DEFAULT_LIMIT: 8,
  MAX_LIMIT: 32,
  MAX_PAGE: 100,
} as const

export const emailOutboxPagination = {
  defaultLimit: 25,
  maxLimit: 100,
  maxPage: 10_000,
} as const
