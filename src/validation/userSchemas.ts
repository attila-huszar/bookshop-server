import { z } from 'zod'
import {
  createSelectSchema,
  createInsertSchema,
  createUpdateSchema,
} from 'drizzle-zod'
import { usersTable } from '@/models/sqlite'
import { UserRole } from '@/types'

export const userSelectSchema = createSelectSchema(usersTable, {
  role: z.enum([UserRole.Admin, UserRole.User]),
})
export const userInsertSchema = createInsertSchema(usersTable, {
  role: z.enum([UserRole.Admin, UserRole.User]),
})
export const userUpdateSchema = createUpdateSchema(usersTable, {
  role: z.enum([UserRole.Admin, UserRole.User]).optional(),
})
