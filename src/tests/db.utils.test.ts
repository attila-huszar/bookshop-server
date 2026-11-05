import { describe, expect, it } from 'bun:test'
import {
  DatabaseStartupError,
  databaseStartupError,
  validateMongoUrl,
} from '@/utils/db.utils'
import { DB_REPO } from '@/types/enums'

describe('MongoDB connection settings', () => {
  it.each([
    'mongodb+srv://user:<db_password>@cluster.test/bookshop',
    'mongodb+srv://user:%3Cdb_password%3E@cluster.test/bookshop',
    'mongodb://<username>:password@localhost/bookshop',
    'mongodb+srv://user:password@<cluster-hostname>/bookshop',
    'mongodb+srv://user:password@%3Ccluster-hostname%3E/bookshop',
  ])('rejects placeholders before connecting: %s', (uri) => {
    expect(() => validateMongoUrl(uri)).toThrow('still contains a placeholder')
  })

  it.each([
    'https://user:private-password@cluster.test/bookshop',
    'mongodb://user:private-password%ZZ@localhost/bookshop',
    'mongodb+srv://user:private-password@',
    'mongodb://user:private-password@localhost:27017oops/bookshop',
    'mongodb://user:private-password@localhost:0/bookshop',
    'mongodb://user:private-password@localhost:65536/bookshop',
    'mongodb://user:private-password@one.test,,two.test/bookshop',
    'mongodb://user:private-password@::1/bookshop',
    'mongodb://user:private-password@[not-ipv6]/bookshop',
    'mongodb://user:private-password@localhost/bookshop#fragment',
    'mongodb://user:private-password@localhost/bookshop/other',
    'mongodb://user:private-password@localhost/bookshop%2Fother',
    'mongodb://user:private-password@localhost/bookshop?authSource=%ZZ',
    'mongodb://user:private-password:extra@localhost/bookshop',
    'mongodb://user:private-password@extra@localhost/bookshop',
    'mongodb://:private-password@localhost/bookshop',
    'mongodb+srv://user:private-password@one.test,two.test/bookshop',
    'mongodb+srv://user:private-password@cluster.test:27017/bookshop',
    'mongodb+srv://user:private-password@[::1]/bookshop',
    'mongodb://user:private-password@local host/bookshop',
    'mongodb://user:private-password@localhost/bookshop\n',
  ])('rejects malformed URIs without exposing credentials: %s', (uri) => {
    let caught: unknown

    try {
      validateMongoUrl(uri)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(DatabaseStartupError)
    expect(String(caught)).toContain('Invalid DB_MONGO_URL')
    expect(String(caught)).not.toContain('private-password')
    expect((caught as Error).cause).toBeUndefined()
  })

  it.each([
    'mongodb://localhost/bookshop',
    'mongodb://user:encoded%40password@one.test:27017,two.test:27017/bookshop?replicaSet=rs0',
    'mongodb+srv://user:encoded%23password@cluster.test/bookshop?authSource=admin',
    'mongodb://user:@localhost/bookshop',
    'mongodb://user@localhost/bookshop',
    'mongodb://user:p%3Ass%2F%40%23%5B%5D%24@[::1]:27017,[2001:db8::1]:27018/bookshop',
    'mongodb://user:secret@%2Ftmp%2Fmongodb-27017.sock/bookshop',
    'mongodb://localhost?authSource=admin',
  ])('accepts valid supported MongoDB URIs: %s', (uri) => {
    expect(() => validateMongoUrl(uri)).not.toThrow()
  })
})

describe('database startup diagnostics', () => {
  it('retains safe driver codes, names, stages and original stack frames', () => {
    const original = Object.assign(
      new Error('duplicate key private-password'),
      { name: 'MongoServerError', code: 11000 },
    )
    const error = databaseStartupError(original, DB_REPO.MONGO, 'schema')
    expect(error.code).toBe(11000)
    expect(error.originalName).toBe('MongoServerError')
    expect(error.stage).toBe('schema')
    expect(error.stack).toContain('db.utils.test.ts')
    expect(error.stack).not.toContain('private-password')
    expect(error.cause).toBeUndefined()
  })

  it.each([
    { dbRepo: DB_REPO.MONGO, code: 18, hint: 'authentication failed' },
    { dbRepo: DB_REPO.MONGO, code: 13, hint: 'access was denied' },
    { dbRepo: DB_REPO.MONGO, code: 'ENOTFOUND', hint: 'DNS lookup failed' },
    { dbRepo: DB_REPO.MONGO, code: 'EAI_AGAIN', hint: 'DNS lookup failed' },
    { dbRepo: DB_REPO.MONGO, code: 'ETIMEDOUT', hint: 'Atlas Network Access' },
    { dbRepo: DB_REPO.MONGO, code: 'ECONNREFUSED', hint: 'not reachable' },
    { dbRepo: DB_REPO.SQLITE, code: 'SQLITE_READONLY', hint: 'not writable' },
    { dbRepo: DB_REPO.SQLITE, code: 'EACCES', hint: 'not writable' },
    { dbRepo: DB_REPO.SQLITE, code: 'SQLITE_CANTOPEN', hint: 'could not open' },
    { dbRepo: DB_REPO.SQLITE, code: 'SQLITE_BUSY', hint: 'locked' },
  ])(
    'explains $dbRepo error $code without leaking driver details',
    (scenario) => {
      const original = Object.assign(
        new Error('mongodb://user:private-password@private-host/bookshop'),
        { code: scenario.code },
      )
      const error = databaseStartupError(original, scenario.dbRepo)

      expect(error).toBeInstanceOf(DatabaseStartupError)
      expect(error.message).toContain(scenario.hint)
      expect(error.stack).not.toContain('private-password')
      expect(error.stack).not.toContain('private-host')
      expect(error.cause).toBeUndefined()
    },
  )

  it.each([
    { message: 'MongoServerSelectionError: timed out', hint: 'not reachable' },
    { message: 'certificate has expired', hint: 'TLS connection failed' },
    { message: 'MongoParseError: bad option', hint: 'connection options' },
    {
      message: 'bad auth : authentication failed',
      hint: 'authentication failed',
    },
    { message: 'unexpected driver exception', hint: 'initialization failed' },
  ])('handles $message', (scenario) => {
    const original = new Error(`${scenario.message} private-password`)
    const error = databaseStartupError(original, DB_REPO.MONGO)

    expect(error.message).toContain(scenario.hint)
    expect(error.stack).not.toContain('private-password')
  })

  it('recognizes nested driver causes without retaining them', () => {
    const cause = Object.assign(new Error('private-password'), { code: 18 })
    const original = new Error('connection failed', { cause })
    const error = databaseStartupError(original, DB_REPO.MONGO)

    expect(error.message).toContain('authentication failed')
    expect(error.cause).toBeUndefined()
  })

  it('handles circular causes and non-Error failures safely', () => {
    const original = new Error('private-password')
    original.cause = original

    for (const value of [original, 'private-password', null]) {
      const error = databaseStartupError(value, DB_REPO.MONGO)

      expect(error.message).toContain('initialization failed')
      expect(error.stack).not.toContain('private-password')
    }
  })
})
