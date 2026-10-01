import { describe, expect, it } from 'bun:test'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { bookQueryBuilder as sqliteBookQuery } from '@/repositories/drizzle/books.query'
import { bookQueryBuilder as mongoBookQuery } from '@/repositories/mongoose/books.query'
import { authorInsertSchema } from '@/validation/authorSchemas'
import { emailSchema, registerSchema } from '@/validation/authSchemas'
import { bookQuerySchema } from '@/validation/bookQuerySchema'
import { bookInsertSchema, bookUpdateSchema } from '@/validation/bookSchemas'
import { idSchema, nameSchema } from '@/validation/commonSchemas'
import {
  cmsOrderUpdateSchema,
  orderInsertSchema,
  paymentIntentStatusSchema,
} from '@/validation/orderSchemas'
import {
  cmsUserInsertSchema,
  cmsUserUpdateSchema,
  profileUpdateSchema,
} from '@/validation/userSchemas'

const item = {
  id: 1,
  title: 'A book',
  author: null,
  imgUrl: null,
  price: 10,
  discount: 0,
  quantity: 1,
}
const order = {
  checkoutRequestId: 'checkout-1',
  paymentStatus: 'processing',
  items: [item],
  total: 10,
  currency: 'USD',
}
const book = {
  title: 'A book',
  authorId: 1,
  genre: 'Fiction',
  imgUrl: 'https://example.com/book.jpg',
  description: 'A description of the book',
  publishYear: 2020,
  rating: 4.5,
  price: 10,
  discount: 0,
  discountPrice: 10,
  topSellers: false,
  newRelease: false,
}
const author = {
  name: 'An Author',
  fullName: '',
  homeland: '',
  biography: '',
  birthYear: '',
  deathYear: '',
}
const user = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  country: 'hu',
  password: 'password123',
  phone: null,
  address: null,
  avatar: null,
  role: 'user',
}

describe('request validation', () => {
  it('accepts international names and punctuation while sharing trimming and length limits', () => {
    for (const name of ['李', 'O’Connor', 'Anne-Marie', 'محمد']) {
      expect(nameSchema.parse(` ${name} `)).toBe(name)
      expect(
        cmsOrderUpdateSchema.parse({ firstName: ` ${name} `, lastName: name }),
      ).toEqual({ firstName: name, lastName: name })
      expect(
        registerSchema.safeParse({
          ...user,
          firstName: name,
          lastName: name,
          avatar: null,
        }).success,
      ).toBe(true)
    }
    expect(nameSchema.parse(' Jane ')).toBe('Jane')
    expect(nameSchema.safeParse(' ').success).toBe(false)
    expect(
      orderInsertSchema.safeParse({ ...order, firstName: 'A'.repeat(100) })
        .success,
    ).toBe(true)
    expect(nameSchema.safeParse('A'.repeat(101)).success).toBe(false)
    for (const value of [null, undefined, '']) {
      expect(nameSchema.safeParse(value).success).toBe(false)
    }
    for (const field of ['firstName', 'lastName']) {
      expect(
        cmsOrderUpdateSchema.safeParse({ [field]: 'A'.repeat(101) }).success,
      ).toBe(false)
    }
  })

  it('requires positive, safe integer IDs without coercing empty values', () => {
    for (const value of [
      null,
      undefined,
      '',
      ' ',
      true,
      0,
      -1,
      1.5,
      '1.5',
      'abc',
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(idSchema.safeParse(value).success).toBe(false)
    }
    expect(idSchema.parse('12')).toBe(12)
  })

  it('normalizes email before validating and rejects blank names or invalid countries', () => {
    expect(emailSchema.parse({ email: '  JANE@EXAMPLE.COM  ' })).toEqual({
      email: 'jane@example.com',
    })
    expect(registerSchema.safeParse({ ...user, avatar: null }).success).toBe(
      true,
    )
    for (const fields of [
      { firstName: '   ' },
      { lastName: '' },
      { country: '12' },
      { email: 'invalid' },
    ]) {
      expect(
        registerSchema.safeParse({ ...user, ...fields, avatar: null }).success,
      ).toBe(false)
    }
  })

  it('rejects all privileged and internal profile fields', () => {
    for (const field of [
      'role',
      'verified',
      'uuid',
      'id',
      'email',
      'verificationToken',
      'verificationExpires',
      'passwordResetToken',
      'passwordResetExpires',
      'createdAt',
    ]) {
      expect(profileUpdateSchema.safeParse({ [field]: 'value' }).success).toBe(
        false,
      )
    }
    expect(
      profileUpdateSchema.parse({
        firstName: ' Jane ',
        phone: '',
        avatar: null,
      }),
    ).toEqual({ firstName: 'Jane', phone: '', avatar: null })
    expect(
      profileUpdateSchema.safeParse({ address: { country: '12' } }).success,
    ).toBe(false)
    expect(profileUpdateSchema.safeParse({ phone: 'abc' }).success).toBe(false)
  })

  it('separates CMS user input from internal user metadata and password hashes', () => {
    expect(cmsUserInsertSchema.parse(user).verified).toBe(false)
    expect(
      cmsUserInsertSchema.safeParse({ ...user, password: 'weak' }).success,
    ).toBe(false)
    expect(
      cmsUserUpdateSchema.safeParse({ role: 'admin', verified: true }).success,
    ).toBe(true)
    for (const field of [
      'password',
      'uuid',
      'verificationToken',
      'passwordResetToken',
    ]) {
      expect(cmsUserUpdateSchema.safeParse({ [field]: 'value' }).success).toBe(
        false,
      )
    }
  })

  it('validates real PaymentIntent states at runtime', () => {
    for (const status of [
      'requires_payment_method',
      'requires_confirmation',
      'requires_action',
      'processing',
      'requires_capture',
      'canceled',
      'succeeded',
    ]) {
      expect(paymentIntentStatusSchema.parse(status)).toBe(status)
    }
    for (const status of ['paid', '', 1, null])
      expect(paymentIntentStatusSchema.safeParse(status).success).toBe(false)
  })

  it('accepts guest drafts and guest orders without names, email, or shipping', () => {
    expect(orderInsertSchema.safeParse(order).success).toBe(true)
    expect(
      cmsOrderUpdateSchema.safeParse({
        firstName: null,
        lastName: null,
        email: null,
        shipping: null,
      }).success,
    ).toBe(true)
    expect(
      cmsOrderUpdateSchema.safeParse({
        firstName: '李',
        shipping: { address: { country: 'JP' } },
      }).success,
    ).toBe(true)
  })

  it('rejects invalid order contents and CMS changes to internal fields', () => {
    for (const fields of [
      { paymentStatus: 'paid' },
      { items: [] },
      { items: [{ ...item, quantity: 0 }] },
      { items: [{ ...item, quantity: 100000 }] },
      { items: [{ ...item, discount: 101 }] },
      { total: -1 },
      { currency: 'invalid' },
      { shipping: { address: 'invalid' } },
    ]) {
      expect(orderInsertSchema.safeParse({ ...order, ...fields }).success).toBe(
        false,
      )
    }
    for (const field of [
      'paymentId',
      'checkoutRequestId',
      'paidAt',
      'lastStripeEventId',
      'lastStripeEventCreated',
      'createdAt',
      'updatedAt',
    ]) {
      expect(cmsOrderUpdateSchema.safeParse({ [field]: 'value' }).success).toBe(
        false,
      )
    }
  })

  it('enforces book domain rules for creation and partial updates', () => {
    expect(bookInsertSchema.safeParse(book).success).toBe(true)
    for (const fields of [
      { title: ' ' },
      { authorId: 0 },
      { price: -1 },
      { rating: 5.1 },
      { rating: 4.55 },
      { discount: 101 },
      { discount: 1.5 },
      { imgUrl: 'not a url' },
      { publishYear: 2020.5 },
    ]) {
      expect(bookInsertSchema.safeParse({ ...book, ...fields }).success).toBe(
        false,
      )
      expect(bookUpdateSchema.safeParse(fields).success).toBe(false)
    }
  })

  it('allows unknown author details but rejects invalid names and years', () => {
    expect(authorInsertSchema.safeParse(author).success).toBe(true)
    for (const fields of [
      { name: ' ' },
      { birthYear: '-10' },
      { deathYear: '2020.5' },
      { biography: 'short' },
    ]) {
      expect(
        authorInsertSchema.safeParse({ ...author, ...fields }).success,
      ).toBe(false)
    }
  })

  it('parses numeric and boolean queries while preserving zero and false', () => {
    const query = bookQuerySchema.parse({
      discount: '0',
      newRelease: 'false',
      topSellers: 'false',
      page: '2',
      rating_lte: '4.5',
    })
    expect(query).toEqual({
      discount: 0,
      newRelease: false,
      topSellers: false,
      page: 2,
      rating_lte: 4.5,
    })
    expect(mongoBookQuery(query)).toEqual({
      discount: 0,
      newRelease: false,
      topSellers: false,
      rating: { $lte: 4.5 },
    })
    const sql = new SQLiteSyncDialect().sqlToQuery(sqliteBookQuery(query)!)
    expect(sql.params).toEqual([0, 4.5, 0, 0])
    expect(sql.sql).toContain('"books"."discount" = ?')
    expect(sqliteBookQuery({})).toBeUndefined()
  })

  it('rejects invalid and inverted query filters', () => {
    for (const query of [
      { newRelease: 'anything' },
      { discount: '' },
      { discount: '-1' },
      { discount: '101' },
      { page: '0' },
      { limit: '100000' },
      { rating_gte: '5', rating_lte: '1' },
      { publishYear: '2020.5' },
    ]) {
      expect(bookQuerySchema.safeParse(query).success).toBe(false)
    }
    expect(
      mongoBookQuery(bookQuerySchema.parse({ title: '[book].*' })),
    ).toEqual({ title: { $regex: '\\[book\\]\\.\\*', $options: 'i' } })
  })
})
