import { newsTable } from '@/models/sqlite'

export type News = typeof newsTable.$inferSelect
export type NewsInsert = typeof newsTable.$inferInsert
