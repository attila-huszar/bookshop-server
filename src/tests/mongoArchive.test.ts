import { describe, expect, it, mock } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { withMongoArchive } from '@/scripts/backup'

type ArchiveInput = Parameters<typeof withMongoArchive>[0]

function setup() {
  let directory = ''
  const input = {
    uri: 'mongodb://backup-user:secret@mongo.test/bookshop',
    dump: mock<NonNullable<ArchiveInput['dump']>>(
      async (configFile, outputFile) => {
        directory = dirname(configFile)
        expect(await Bun.file(configFile).text()).toBe(
          `uri: ${JSON.stringify(input.uri)}\n`,
        )
        expect(dirname(outputFile)).toBe(directory)

        if (process.platform !== 'win32') {
          expect((await stat(directory)).mode & 0o777).toBe(0o700)
          expect((await stat(configFile)).mode & 0o777).toBe(0o600)
          expect((await stat(outputFile)).mode & 0o777).toBe(0o600)
        }

        await Bun.write(outputFile, 'completed archive')
      },
    ),
    consume: mock<ArchiveInput['consume']>(async (archive) => {
      expect(await archive.text()).toBe('completed archive')
    }),
  }

  return { input, directory: () => directory }
}

describe('temporary Mongo archives', () => {
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
    context.input.dump.mockImplementationOnce(
      async (configFile, outputFile) => {
        await successfulDump(configFile, outputFile)
        throw new Error('mongodump failed')
      },
    )

    await rejects(withMongoArchive(context.input), /mongodump failed/)

    expect(context.input.consume).not.toHaveBeenCalled()
    await rejects(stat(context.directory()), { code: 'ENOENT' })
  })

  it('rejects an empty dump before consuming it', async () => {
    let directory = ''
    const consume = mock<ArchiveInput['consume']>(() => Promise.resolve())

    await rejects(
      withMongoArchive({
        uri: 'mongodb://mongo.test/bookshop',
        dump: (configFile) => {
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
})
