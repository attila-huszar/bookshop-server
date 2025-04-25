import { newsTable } from '../repositories'

export type NewsResponse = typeof newsTable.$inferSelect
