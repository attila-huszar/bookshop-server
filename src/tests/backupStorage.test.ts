import { describe, expect, it, mock } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { withBackupArchive } from '@/scripts/shared/backupHelpers'
import {
  BackupRetentionError,
  backupToStorage,
} from '@/scripts/shared/backupStorage'
import { backupScriptPath } from '@/constants/backup'
import { DB_REPO } from '@/types/enums'

type BackupInput = Parameters<typeof backupToStorage>[0]

const now = Date.parse('2026-11-03T02:30:00Z')
const day = 24 * 60 * 60 * 1000
const old = new Date(now - 8 * day).toISOString()
const boundary = new Date(now - day).toISOString()
function setup(backupType: DB_REPO) {
  const dump = mock<(config: string, outputFile: string) => Promise<void>>(
    async (_config, outputFile) => {
      await Bun.write(outputFile, 'completed archive')
    },
  )
  const upload = mock<BackupInput['storage']['uploadAndVerify']>(
    async (_key, archive) => {
      expect(await archive.text()).toBe('completed archive')
    },
  )
  const list = mock<BackupInput['storage']['list']>(() =>
    Promise.resolve({ contents: [] }),
  )
  const remove = mock<BackupInput['storage']['remove']>(() => Promise.resolve())

  return {
    backupType,
    retention: { daily: 1, weekly: 0, monthly: 0 },
    now,
    withArchive: mock<BackupInput['withArchive']>(async (consume) => {
      await withBackupArchive({
        backupType,
        create: ({ outputFile }) => dump('', outputFile),
        consume,
      })
    }),
    storage: { uploadAndVerify: upload, list, remove },
    dump,
    upload,
    list,
    remove,
  }
}

describe.each([DB_REPO.MONGO, DB_REPO.SQLITE])(
  '%s backup storage',
  (backupType) => {
    const prefix = `backups/${backupType.toLowerCase()}/`
    const extension =
      backupType === DB_REPO.MONGO ? '.archive.gz' : '.sqlite.gz'
    const otherExtension =
      backupType === DB_REPO.MONGO ? '.sqlite.gz' : '.archive.gz'
    const first = `${prefix}2026-10-26T02-30-00-000Z-00000000-0000-4000-8000-000000000001${extension}`
    const second = `${prefix}2026-10-27T02-30-00-000Z-00000000-0000-4000-8000-000000000002${extension}`

    function archive(date: string, id = 1) {
      const timestamp = new Date(date).toISOString()

      return {
        key: `${prefix}${timestamp.replace(/[:.]/g, '-')}-00000000-0000-4000-8000-${String(id).padStart(12, '0')}${extension}`,
        lastModified: timestamp,
      }
    }

    function inputWithOldBackup() {
      const input = setup(backupType)
      input.list.mockResolvedValue({
        contents: [{ key: first, lastModified: old }],
      })

      return input
    }

    it('fails before running external operations when S3 configuration is missing', async () => {
      const child = Bun.spawn(
        [process.execPath, '--no-env-file', backupScriptPath],
        {
          env: {
            ...process.env,
            DB_REPO: backupType,
            AWS_BUCKET: '',
            AWS_REGION: '',
            AWS_ACCESS_KEY_ID: '',
            AWS_SECRET_ACCESS_KEY: '',
          },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      )
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])

      expect(exitCode).toBe(1)
      expect(stdout).toContain(
        `${backupType === DB_REPO.MONGO ? 'Mongo' : 'SQLite'} backups require the AWS S3 bucket, region and credentials`,
      )
      expect(stderr).toBe('')
    })

    it('uploads a complete archive before running retention and reports the stored key', async () => {
      const input = inputWithOldBackup()
      let uploadFinished = false
      input.upload.mockImplementationOnce(async (_key, archive) => {
        expect(await archive.text()).toBe('completed archive')
        uploadFinished = true
      })
      input.list.mockImplementationOnce(() => {
        expect(uploadFinished).toBe(true)

        return Promise.resolve({
          contents: [{ key: first, lastModified: old }],
        })
      })

      const result = await backupToStorage(input)

      expect(result.key).toMatch(
        /^backups\/(?:mongo|sqlite)\/\d{4}-\d{2}-\d{2}T[\d-]+Z-[\da-f-]{36}\.(?:archive|sqlite)\.gz$/,
      )
      expect(input.upload.mock.calls[0]?.[0]).toBe(result.key)
      expect(result.removed).toBe(1)
      expect(input.remove).toHaveBeenCalledWith(first)
    })

    it('keeps the current upload, recent objects, unrelated keys and malformed timestamps', async () => {
      const input = inputWithOldBackup()
      input.list.mockImplementationOnce(() => {
        const uploadedKey = input.upload.mock.calls[0]![0]

        return Promise.resolve({
          contents: [
            { key: first, lastModified: old },
            { key: second, lastModified: boundary },
            { key: uploadedKey, lastModified: old },
            {
              key: first.replace(prefix, 'avatars/mongo/'),
              lastModified: old,
            },
            {
              key: first.replace(prefix, 'backups/other/'),
              lastModified: old,
            },
            { key: `${prefix}manual.archive.gz`, lastModified: old },
            {
              key: first.replace(extension, otherExtension),
              lastModified: old,
            },
            {
              key: first.replace('000000000001', '000000000003'),
              lastModified: 'invalid',
            },
            { key: first.replace('000000000001', '000000000004') },
          ],
        })
      })

      expect((await backupToStorage(input)).removed).toBe(1)
      expect(input.remove).toHaveBeenCalledTimes(1)
      expect(input.remove).toHaveBeenCalledWith(first)
    })

    it('follows continuation tokens when pruning old archives', async () => {
      const input = inputWithOldBackup()
      input.list
        .mockResolvedValueOnce({
          contents: [{ key: first, lastModified: old }],
          isTruncated: true,
          nextContinuationToken: 'next-page',
        })
        .mockResolvedValueOnce({
          contents: [{ key: second, lastModified: old }],
        })

      expect((await backupToStorage(input)).removed).toBe(2)
      expect(input.list).toHaveBeenNthCalledWith(2, prefix, 'next-page')
    })

    it('keeps the union of 7 daily, 4 weekly and 12 monthly points across all pages', async () => {
      const input = setup(backupType)
      input.retention = { daily: 7, weekly: 4, monthly: 12 }
      const retained = [
        '2026-11-02',
        '2026-11-01',
        '2026-10-31',
        '2026-10-30',
        '2026-10-29',
        '2026-10-28',
        '2026-10-25',
        '2026-10-18',
        '2026-09-30',
        '2026-08-31',
        '2026-07-31',
        '2026-06-30',
        '2026-05-31',
        '2026-04-30',
        '2026-03-31',
        '2026-02-28',
        '2026-01-31',
        '2025-12-31',
      ].map((date) => archive(`${date}T02:00:00Z`))
      const expired = [
        '2026-10-28T01:00:00Z',
        '2026-10-27T02:00:00Z',
        '2026-10-24T02:00:00Z',
        '2026-09-29T02:00:00Z',
        '2026-07-30T02:00:00Z',
        '2025-11-30T02:00:00Z',
      ].map((date) => archive(date))
      input.list
        .mockResolvedValueOnce({
          contents: expired,
          isTruncated: true,
          nextContinuationToken: 'anchors',
        })
        .mockResolvedValueOnce({ contents: retained.reverse() })

      const result = await backupToStorage(input)

      expect(result.retained).toBe(19)
      expect(result.prunable.length).toBe(expired.length)
      expect(result.removed).toBe(expired.length)
      expect(input.remove.mock.calls.map(([key]) => key).sort()).toEqual(
        expired.map((object) => object.key).sort(),
      )
    })

    it('counts populated periods so a long outage does not discard the previous recovery point', async () => {
      const input = setup(backupType)
      input.retention.daily = 2
      const latest = archive('2026-01-01T02:00:00Z')
      const older = archive('2025-12-01T02:00:00Z')
      input.list.mockResolvedValue({ contents: [older, latest] })

      expect((await backupToStorage(input)).retained).toBe(2)
      expect(input.remove).toHaveBeenCalledTimes(1)
      expect(input.remove).toHaveBeenCalledWith(older.key)
    })

    it('uses Monday UTC week boundaries across the year change', async () => {
      const input = setup(backupType)
      input.now = Date.parse('2027-01-02T02:30:00Z')
      input.retention.weekly = 2
      const retained = archive('2026-12-27T23:59:59Z')
      const expired = [
        archive('2026-12-28T00:00:00Z'),
        archive('2026-12-21T00:00:00Z'),
        archive('2026-12-20T23:59:59Z'),
      ]
      input.list.mockResolvedValue({ contents: [retained, ...expired] })

      expect((await backupToStorage(input)).retained).toBe(2)
      expect(input.remove.mock.calls.map(([key]) => key).sort()).toEqual(
        expired.map((object) => object.key).sort(),
      )
    })

    it('uses calendar months across the year change', async () => {
      const input = setup(backupType)
      input.now = Date.parse('2027-01-02T02:30:00Z')
      input.retention.monthly = 3
      const retained = [
        archive('2026-12-31T02:00:00Z'),
        archive('2026-11-30T02:00:00Z'),
      ]
      const expired = [
        archive('2026-12-01T02:00:00Z'),
        archive('2026-11-01T02:00:00Z'),
        archive('2026-10-31T02:00:00Z'),
      ]
      input.list.mockResolvedValue({ contents: [...expired, ...retained] })

      expect((await backupToStorage(input)).retained).toBe(3)
      expect(input.remove.mock.calls.map(([key]) => key).sort()).toEqual(
        expired.map((object) => object.key).sort(),
      )
    })

    it('protects the full last 24 hours and future objects from concurrent runs', async () => {
      const input = setup(backupType)
      const protectedObjects = [
        archive(new Date(now - day).toISOString()),
        archive(new Date(now - 1).toISOString()),
        archive(new Date(now + day).toISOString()),
      ]
      const expired = archive(new Date(now - day - 1).toISOString())
      input.list.mockResolvedValue({ contents: [expired, ...protectedObjects] })

      expect((await backupToStorage(input)).removed).toBe(1)
      expect(input.remove).toHaveBeenCalledWith(expired.key)
    })

    it('selects deterministically when timestamps tie and ignores repeated listing entries', async () => {
      const input = setup(backupType)
      input.retention.daily = 2
      const retained = archive('2026-11-01T02:00:00Z', 1)
      const expired = archive('2026-11-01T02:00:00Z', 2)
      input.list.mockResolvedValue({ contents: [expired, retained, expired] })

      expect((await backupToStorage(input)).removed).toBe(1)
      expect(input.remove).toHaveBeenCalledWith(expired.key)
    })

    it('reports a dry-run plan after verification without deleting objects', async () => {
      const input = inputWithOldBackup()
      const result = await backupToStorage({ ...input, dryRun: true })

      expect(input.upload).toHaveBeenCalledTimes(1)
      expect(result).toMatchObject({
        retained: 1,
        prunable: [first],
        removed: 0,
      })
      expect(input.remove).not.toHaveBeenCalled()
    })

    it('does not delete anything when a later listing page fails', async () => {
      const input = inputWithOldBackup()
      input.list
        .mockResolvedValueOnce({
          contents: [{ key: first, lastModified: old }],
          isTruncated: true,
          nextContinuationToken: 'broken-page',
        })
        .mockRejectedValueOnce(new Error('Listing failed'))

      await rejects(backupToStorage(input), BackupRetentionError)

      expect(input.remove).not.toHaveBeenCalled()
    })

    it('detects pagination cycles spanning multiple tokens before deleting', async () => {
      const input = inputWithOldBackup()
      for (const nextContinuationToken of ['a', 'b', 'a']) {
        input.list.mockResolvedValueOnce({
          contents: [{ key: first, lastModified: old }],
          isTruncated: true,
          nextContinuationToken,
        })
      }

      await rejects(backupToStorage(input), BackupRetentionError)

      expect(input.list).toHaveBeenCalledTimes(3)
      expect(input.remove).not.toHaveBeenCalled()
    })

    it('does not upload or prune after the dump fails', async () => {
      const input = inputWithOldBackup()
      input.dump.mockRejectedValueOnce(new Error('Dump failed'))

      await rejects(backupToStorage(input), /Dump failed/)

      expect(input.upload).not.toHaveBeenCalled()
      expect(input.list).not.toHaveBeenCalled()
      expect(input.remove).not.toHaveBeenCalled()
    })

    it.each(['Upload failed', 'Checksum mismatch'])(
      'does not prune existing backups after %s',
      async (failure) => {
        const input = inputWithOldBackup()
        input.upload.mockRejectedValueOnce(new Error(failure))

        await rejects(backupToStorage(input), new RegExp(failure))

        expect(input.list).not.toHaveBeenCalled()
        expect(input.remove).not.toHaveBeenCalled()
      },
    )

    it.each([
      { daily: 0, weekly: 0, monthly: 0 },
      { daily: -1, weekly: 4, monthly: 12 },
      { daily: 1.5, weekly: 4, monthly: 12 },
      { daily: NaN, weekly: 4, monthly: 12 },
      { daily: 7, weekly: -1, monthly: 12 },
      { daily: 7, weekly: 4, monthly: Infinity },
    ])('rejects invalid retention %j before dumping', async (retention) => {
      const input = inputWithOldBackup()
      input.retention = retention

      await rejects(backupToStorage(input), /retention count/)

      expect(input.dump).not.toHaveBeenCalled()
      expect(input.upload).not.toHaveBeenCalled()
      expect(input.remove).not.toHaveBeenCalled()
    })

    it('reports a retained upload when S3 listing fails', async () => {
      const input = inputWithOldBackup()
      const failure = new Error('List denied')
      input.list.mockRejectedValueOnce(failure)

      await rejects(backupToStorage(input), (error: unknown) => {
        expect(error).toBeInstanceOf(BackupRetentionError)

        if (error instanceof BackupRetentionError) {
          expect(error.key).toBe(input.upload.mock.calls[0]![0])
          expect(error.cause).toBe(failure)
        }

        return true
      })

      expect(input.remove).not.toHaveBeenCalled()
    })

    it('reports an S3 retention failure if deleting an old archive fails', async () => {
      const input = inputWithOldBackup()
      input.remove.mockRejectedValueOnce(new Error('Delete denied'))

      await rejects(backupToStorage(input), BackupRetentionError)

      expect(input.upload).toHaveBeenCalledTimes(1)
    })

    it('deletes oldest first and stops cleanup after a deletion failure', async () => {
      const input = setup(backupType)
      const oldest = archive('2026-10-01T02:00:00Z')
      const middle = archive('2026-10-02T02:00:00Z')
      const newest = archive('2026-10-03T02:00:00Z')
      input.list.mockResolvedValue({ contents: [newest, middle, oldest] })
      input.remove
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(new Error('Delete failed'))

      await rejects(backupToStorage(input), BackupRetentionError)

      expect(input.remove.mock.calls).toEqual([[oldest.key], [middle.key]])
    })

    it('rejects an invalid retention clock before creating an archive', async () => {
      const input = setup(backupType)
      input.now = NaN

      await rejects(backupToStorage(input), /retention time/)

      expect(input.withArchive).not.toHaveBeenCalled()
      expect(input.upload).not.toHaveBeenCalled()
      expect(input.list).not.toHaveBeenCalled()
    })

    it('rejects a truncated listing without a continuation token before deleting objects', async () => {
      const input = inputWithOldBackup()
      input.list.mockResolvedValueOnce({
        contents: [{ key: first, lastModified: old }],
        isTruncated: true,
      })

      await rejects(backupToStorage(input), BackupRetentionError)

      expect(input.remove).not.toHaveBeenCalled()
    })

    it('rejects a repeated continuation token instead of looping', async () => {
      const input = inputWithOldBackup()
      input.list.mockResolvedValue({
        contents: [],
        isTruncated: true,
        nextContinuationToken: 'same-token',
      })

      await rejects(backupToStorage(input), BackupRetentionError)

      expect(input.list).toHaveBeenCalledTimes(2)
    })
  },
)
