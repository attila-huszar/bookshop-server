import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod'
import { z } from 'zod'
import { usersTable } from '@/models/sqlite'
import { UserRole } from '@/types'

export const userSelectSchema = createSelectSchema(usersTable, {
  role: z.enum(UserRole),
})
export const userInsertSchema = createInsertSchema(usersTable, {
  role: z.enum(UserRole),
})
export const userUpdateSchema = createUpdateSchema(usersTable, {
  role: z.enum(UserRole).optional(),
})
