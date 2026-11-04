import { describe, expect, it, mock } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { withMongoArchive } from '@/scripts/shared/backupArchive'

type ArchiveInput = Parameters<typeof withMongoArchive>[0]

function setup(expectedUri?: string) {
  let directory = ''
  const input = {
    uri: 'mongodb://backup-user:secret@mongo.test/?replicaSet=rs0&authSource=bookshop',
    mode: 'oplog' as NonNullable<ArchiveInput['mode']>,
    dump: mock<NonNullable<ArchiveInput['dump']>>(async (command) => {
      expect(command[0]).toBe('mongodump')
      expect(command.includes('--oplog')).toBe(input.mode === 'oplog')
      expect(command).toContain('--gzip')
      const configFile = command
        .find((argument) => argument.startsWith('--config='))!
        .slice('--config='.length)
      const outputFile = command
        .find((argument) => argument.startsWith('--archive='))!
        .slice('--archive='.length)
      directory = dirname(configFile)
      expect(await Bun.file(configFile).text()).toBe(
        `uri: ${JSON.stringify(expectedUri ?? input.uri)}\n`,
      )
      expect(dirname(outputFile)).toBe(directory)

      if (process.platform !== 'win32') {
        expect((await stat(directory)).mode & 0o777).toBe(0o700)
        expect((await stat(configFile)).mode & 0o777).toBe(0o600)
        expect((await stat(outputFile)).mode & 0o777).toBe(0o600)
      }

      await Bun.write(outputFile, 'completed archive')
    }),
    consume: mock<ArchiveInput['consume']>(async (archive) => {
      expect(await archive.text()).toBe('completed archive')
    }),
  }

  return { input, directory: () => directory }
}

describe('temporary Mongo archives', () => {
  it('skips upload and removes scratch files when interrupted after the dump', async () => {
    const context = setup()
    const controller = new AbortController()
    const successfulDump = context.input.dump.getMockImplementation()!
    context.input.dump.mockImplementationOnce(async (command) => {
      await successfulDump(command)
      controller.abort(new Error('Backup interrupted'))
    })

    await rejects(
      withMongoArchive({ ...context.input, signal: controller.signal }),
      /Backup interrupted/,
    )

    expect(context.input.consume).not.toHaveBeenCalled()
    await rejects(stat(context.directory()), { code: 'ENOENT' })
  })

  it('waits for a completed dump, consumes the file, then removes all temporary files', async () => {
    const context = setup()

    await withMongoArchive(context.input)

    expect(context.input.consume).toHaveBeenCalledTimes(1)
    expect(
      await Bun.file(`${context.directory()}/mongodump.yaml`).exists(),
    ).toBe(false)
    await rejects(stat(context.directory()), { code: 'ENOENT' })
  })

  it('does not consume a partial dump and cleans up after dump failure', async () => {
    const context = setup()
    const successfulDump = context.input.dump.getMockImplementation()!
    context.input.dump.mockImplementationOnce(async (command) => {
      await successfulDump(command)
      throw new Error('mongodump failed')
    })

    await rejects(withMongoArchive(context.input), /mongodump failed/)

    expect(context.input.dump).toHaveBeenCalledTimes(1)
    expect(context.input.consume).not.toHaveBeenCalled()
    await rejects(stat(context.directory()), { code: 'ENOENT' })
  })

  it('rejects an empty dump before consuming it', async () => {
    let directory = ''
    const consume = mock<ArchiveInput['consume']>(() => Promise.resolve())

    await rejects(
      withMongoArchive({
        uri: 'mongodb://mongo.test/?replicaSet=rs0',
        dump: (command) => {
          const configFile = command
            .find((argument) => argument.startsWith('--config='))!
            .slice('--config='.length)
          directory = dirname(configFile)

          return Promise.resolve()
        },
        consume,
      }),
      /empty archive/,
    )

    expect(consume).not.toHaveBeenCalled()
    await rejects(stat(directory), { code: 'ENOENT' })
  })

  it('propagates consumer failure and still removes the archive and credentials', async () => {
    const context = setup()
    context.input.consume.mockRejectedValueOnce(new Error('Upload failed'))

    await rejects(withMongoArchive(context.input), /Upload failed/)

    await rejects(stat(context.directory()), { code: 'ENOENT' })
  })

  it.each([
    'mongodb://mongo1.test:27017,mongo2.test:27017/?replicaSet=rs0',
    'mongodb+srv://backup-user:secret@mongo.test/?authSource=admin',
    'mongodb://mongo.test?replicaSet=rs0',
  ])(
    'keeps replica-set hosts and authentication options in %s',
    async (uri) => {
      const context = setup()
      context.input.uri = uri

      await withMongoArchive(context.input)

      expect(context.input.dump).toHaveBeenCalledTimes(1)
      await rejects(stat(context.directory()), { code: 'ENOENT' })
    },
  )

  it.each(['', 'https://mongo.test/', 'mongodb://mongo.test/bookshop/nested'])(
    'rejects a missing or malformed backup URI before dumping: %s',
    async (uri) => {
      const context = setup()
      context.input.uri = uri

      await rejects(withMongoArchive(context.input), /DB_MONGO_URL/)

      expect(context.input.dump).not.toHaveBeenCalled()
      expect(context.input.consume).not.toHaveBeenCalled()
      expect(context.directory()).toBe('')
    },
  )

  it.each([
    {
      uri: 'mongodb://user:secret@mongo.test/bookshop?replicaSet=rs0',
      expected:
        'mongodb://user:secret@mongo.test/?replicaSet=rs0&authSource=bookshop',
    },
    {
      uri: 'mongodb+srv://user:encoded%40password@cluster.test/bookshop?authSource=admin',
      expected:
        'mongodb+srv://user:encoded%40password@cluster.test/?authSource=admin',
    },
    {
      uri: 'mongodb://user:secret@mongo1.test:27017,mongo2.test:27017/bookshop?replicaSet=rs0&authSource=admin',
      expected:
        'mongodb://user:secret@mongo1.test:27017,mongo2.test:27017/?replicaSet=rs0&authSource=admin',
    },
  ])(
    'writes a derived oplog URI into the private dump configuration: $uri',
    async ({ uri, expected }) => {
      const context = setup(expected)
      context.input.uri = uri

      await withMongoArchive(context.input)

      expect(context.input.uri).toBe(uri)
      expect(context.input.dump).toHaveBeenCalledTimes(1)
      expect(context.input.consume).toHaveBeenCalledTimes(1)
      await rejects(stat(context.directory()), { code: 'ENOENT' })
    },
  )

  it.each([
    'mongodb+srv://backup-user:encoded%40password@cluster.test/bookshop?authSource=admin',
    'mongodb://mongo.test/bookshop?replicaSet=rs0&authSource=admin',
  ])(
    'creates a database-scoped logical dump without oplog: %s',
    async (uri) => {
      const context = setup()
      context.input.uri = uri
      context.input.mode = 'logical'

      await withMongoArchive(context.input)

      expect(context.input.dump).toHaveBeenCalledTimes(1)
      expect(context.input.consume).toHaveBeenCalledTimes(1)
      await rejects(stat(context.directory()), { code: 'ENOENT' })
    },
  )

  it.each([
    '',
    'mongodb+srv://cluster.test/?authSource=admin',
    'mongodb://mongo.test?replicaSet=rs0',
  ])('rejects a logical dump without an explicit database: %s', async (uri) => {
    const context = setup()
    context.input.uri = uri
    context.input.mode = 'logical'

    await rejects(withMongoArchive(context.input), /DB_MONGO_URL/)

    expect(context.input.dump).not.toHaveBeenCalled()
    expect(context.input.consume).not.toHaveBeenCalled()
    expect(context.directory()).toBe('')
  })
})
