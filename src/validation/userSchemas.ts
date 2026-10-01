import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod'
import { z } from 'zod'
import { usersTable } from '@/models/sqlite'
import { UserRole } from '@/types'
import type { SchemaRefinements } from '@/types'
import { emailSchema, passwordSchema } from './authSchemas'
import {
  addressSchema,
  countrySchema,
  nameSchema,
  phoneSchema,
} from './commonSchemas'

const userFields = {
  email: emailSchema.shape.email,
  firstName: nameSchema,
  lastName: nameSchema,
  country: countrySchema,
  phone: phoneSchema.nullable(),
  address: addressSchema.nullable(),
  avatar: z.url().or(z.literal('')).nullable(),
} satisfies SchemaRefinements<typeof usersTable.$inferInsert>

export const userSelectSchema = createSelectSchema(usersTable, {
  role: z.enum(UserRole),
})
export const userInsertSchema = createInsertSchema(usersTable, {
  ...userFields,
  role: z.enum(UserRole),
})
export const userUpdateSchema = createUpdateSchema(usersTable, {
  email: userFields.email.optional(),
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  country: countrySchema.optional(),
  phone: userFields.phone.optional(),
  address: userFields.address.optional(),
  avatar: userFields.avatar.optional(),
  role: z.enum(UserRole).optional(),
} satisfies SchemaRefinements<Partial<typeof usersTable.$inferInsert>>)

export const profileUpdateSchema = userUpdateSchema
  .pick({
    firstName: true,
    lastName: true,
    country: true,
    phone: true,
    address: true,
    password: true,
  })
  .extend({
    password: passwordSchema.shape.password.optional(),
    currentPassword: z.string().min(1).optional(),
    avatar: z.null().optional(),
  })
  .strict()
  .refine((value) => !value.password || Boolean(value.currentPassword), {
    message: 'Current password is required to change your password',
    path: ['currentPassword'],
  })

export const cmsUserUpdateSchema = userUpdateSchema
  .pick({
    email: true,
    firstName: true,
    lastName: true,
    country: true,
    phone: true,
    address: true,
    avatar: true,
    role: true,
    verified: true,
  })
  .strict()

export const cmsUserInsertSchema = userInsertSchema
  .pick({
    email: true,
    firstName: true,
    lastName: true,
    country: true,
    phone: true,
    address: true,
    avatar: true,
    role: true,
    verified: true,
    password: true,
  })
  .extend({
    password: passwordSchema.shape.password,
    verified: z.boolean().default(false),
  })
