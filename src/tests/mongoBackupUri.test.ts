import { describe, expect, it, mock } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { getMongoBackupUri } from '@/scripts/shared/mongoBackupUri'

type ResolveTxt = NonNullable<
  Parameters<typeof getMongoBackupUri>[0]['resolveTxt']
>

describe('MongoDB backup connection strings', () => {
  it('uses the exact app URI in logical mode without resolving DNS', async () => {
    const uri =
      'mongodb+srv://user:p%40ss@cluster.test/bookshop?retryWrites=true&w=majority'
    const lookup = mock<ResolveTxt>(() =>
      Promise.reject(new Error('DNS must not be used')),
    )

    expect(
      await getMongoBackupUri({ uri, mode: 'logical', resolveTxt: lookup }),
    ).toBe(uri)
    expect(lookup).not.toHaveBeenCalled()
  })

  it.each([
    {
      uri: 'mongodb://user:p%40ss@mongo.test:27017/bookshop?replicaSet=rs0&retryWrites=true&w=majority',
      expected:
        'mongodb://user:p%40ss@mongo.test:27017/?replicaSet=rs0&retryWrites=true&w=majority&authSource=bookshop',
    },
    {
      uri: 'mongodb://user:secret@[::1]:27017/bookshop',
      expected: 'mongodb://user:secret@[::1]:27017/?authSource=bookshop',
    },
    {
      uri: 'mongodb://user:secret@mongo1.test:27017,mongo2.test:27018/bookshop?authSource=admin&readPreference=secondary',
      expected:
        'mongodb://user:secret@mongo1.test:27017,mongo2.test:27018/?authSource=admin&readPreference=secondary',
    },
    {
      uri: 'mongodb+srv://user:p%2Fss@cluster.test/bookshop?authSource=admin&retryWrites=true',
      expected:
        'mongodb+srv://user:p%2Fss@cluster.test/?authSource=admin&retryWrites=true',
    },
    {
      uri: 'mongodb://user:secret@mongo.test/bookshop?AUTHSOURCE=admin',
      expected: 'mongodb://user:secret@mongo.test/?AUTHSOURCE=admin',
    },
    {
      uri: 'mongodb://user:secret@mongo.test/%62ookshop',
      expected: 'mongodb://user:secret@mongo.test/?authSource=bookshop',
    },
    {
      uri: 'mongodb://mongo.test/bookshop',
      expected: 'mongodb://mongo.test/',
    },
    {
      uri: 'mongodb://mongo.test/bookshop?authMechanism=MONGODB-X509&tls=true',
      expected: 'mongodb://mongo.test/?authMechanism=MONGODB-X509&tls=true',
    },
    {
      uri: 'mongodb://user:secret@mongo.test/?authSource=bookshop',
      expected: 'mongodb://user:secret@mongo.test/?authSource=bookshop',
    },
  ])(
    'preserves hosts, credentials and authentication for $uri',
    async ({ uri, expected }) => {
      const lookup = mock<ResolveTxt>(() =>
        Promise.reject(new Error('DNS must not be used')),
      )

      expect(
        await getMongoBackupUri({ uri, mode: 'oplog', resolveTxt: lookup }),
      ).toBe(expected)
      expect(lookup).not.toHaveBeenCalled()
    },
  )

  it.each([
    {
      records: [['authSource=admin&replicaSet=', 'atlas-set']],
      source: 'admin',
    },
    { records: [['replicaSet=rs0']], source: 'bookshop' },
    { records: [], source: 'bookshop' },
  ])(
    'preserves implicit SRV authentication with $records',
    async ({ records, source }) => {
      const lookup = mock<ResolveTxt>(() => Promise.resolve(records))
      const uri =
        'mongodb+srv://user:secret@cluster.test/bookshop?retryWrites=true'

      expect(
        await getMongoBackupUri({ uri, mode: 'oplog', resolveTxt: lookup }),
      ).toBe(
        `mongodb+srv://user:secret@cluster.test/?retryWrites=true&authSource=${source}`,
      )
      expect(lookup).toHaveBeenCalledWith('cluster.test')
      expect(lookup).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['ENODATA', 'ENOTFOUND'])(
    'keeps the database authentication default when DNS reports %s',
    async (code) => {
      const lookup = () =>
        Promise.reject(Object.assign(new Error('Missing DNS TXT'), { code }))

      expect(
        await getMongoBackupUri({
          uri: 'mongodb+srv://user:secret@cluster.test/bookshop',
          mode: 'oplog',
          resolveTxt: lookup,
        }),
      ).toBe('mongodb+srv://user:secret@cluster.test/?authSource=bookshop')
    },
  )

  it.each([
    { records: [['authSource=admin'], ['authSource=bookshop']] },
    { records: [['authSource=']] },
  ])(
    'rejects ambiguous or empty DNS authentication: $records',
    async ({ records }) => {
      await rejects(
        getMongoBackupUri({
          uri: 'mongodb+srv://user:secret@cluster.test/bookshop',
          mode: 'oplog',
          resolveTxt: () => Promise.resolve(records),
        }),
        /multiple DNS TXT|empty DNS authSource/,
      )
    },
  )

  it('stops on DNS failures without exposing credentials', async () => {
    const failure = new Error('DNS unavailable')

    await rejects(
      getMongoBackupUri({
        uri: 'mongodb+srv://user:never-print-this@cluster.test/bookshop',
        mode: 'oplog',
        resolveTxt: () => Promise.reject(failure),
      }),
      (error: unknown) => {
        expect(error).toBeInstanceOf(Error)
        expect(String(error)).toContain('authentication settings')
        expect(String(error)).not.toContain('never-print-this')
        expect((error as Error).cause).toBe(failure)

        return true
      },
    )
  })

  it('rejects malformed URIs without exposing their password', async () => {
    await rejects(
      getMongoBackupUri({
        uri: 'https://user:never-print-this@mongo.test/bookshop',
        mode: 'oplog',
      }),
      (error: unknown) => {
        expect(String(error)).toContain('valid DB_MONGO_URL')
        expect(String(error)).not.toContain('never-print-this')
        expect((error as Error).cause).toBeUndefined()

        return true
      },
    )
  })
})
