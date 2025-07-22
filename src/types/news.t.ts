import { newsTable } from '@/repositories'

export type News = typeof newsTable.$inferSelect
