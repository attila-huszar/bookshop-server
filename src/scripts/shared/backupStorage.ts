import type { BunFile } from 'bun'
import { backupRetentionPolicy } from '@/constants/backup'
import { DB_REPO } from '@/types/enums'
import type { WithBackupArchive } from './backupArchive'

const archiveExtensions = {
  [DB_REPO.MONGO]: '.archive.gz',
  [DB_REPO.SQLITE]: '.sqlite.gz',
} as const
const archiveName =
  /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.(?:archive|sqlite)\.gz$/

type BackupListing = {
  contents?: { key: string; lastModified?: string }[]
  isTruncated?: boolean
  nextContinuationToken?: string
}

export type BackupStorage = {
  uploadAndVerify: (key: string, archive: BunFile) => Promise<void>
  list: (prefix: string, token?: string) => Promise<BackupListing>
  remove: (key: string) => Promise<void>
}

type BackupInput = {
  backupType: DB_REPO
  retention: { daily: number; weekly: number; monthly: number }
  dryRun?: boolean
  withArchive: WithBackupArchive
  storage: BackupStorage
  now?: number
}

type BackupCandidate = { key: string; modified: number }

function retainedKeys(
  candidates: BackupCandidate[],
  retention: BackupInput['retention'],
): Set<string> {
  const retained = new Set<string>()
  const daily = new Set<string>()
  const weekly = new Set<number>()
  const monthly = new Set<string>()

  for (const candidate of candidates) {
    const date = new Date(candidate.modified)
    const day = date.toISOString().slice(0, 10)
    const month = day.slice(0, 7)
    date.setUTCHours(0, 0, 0, 0)
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
    const week = date.getTime()

    if (!daily.has(day) && daily.size < retention.daily) {
      daily.add(day)
      retained.add(candidate.key)
    }

    if (!weekly.has(week) && weekly.size < retention.weekly) {
      weekly.add(week)
      retained.add(candidate.key)
    }

    if (!monthly.has(month) && monthly.size < retention.monthly) {
      monthly.add(month)
      retained.add(candidate.key)
    }
  }

  return retained
}

export class BackupRetentionError extends Error {
  constructor(
    readonly key: string,
    cause: unknown,
  ) {
    super('Backup uploaded and verified, but S3 retention cleanup failed', {
      cause,
    })
  }
}

export async function backupToStorage(input: BackupInput): Promise<{
  key: string
  retained: number
  prunable: string[]
  removed: number
}> {
  for (const tier of ['daily', 'weekly', 'monthly'] as const) {
    const count = input.retention[tier]

    if (!Number.isSafeInteger(count) || count < (tier === 'daily' ? 1 : 0)) {
      throw new Error(`Invalid ${tier} backup retention count`)
    }
  }

  const now = input.now ?? Date.now()

  if (!Number.isFinite(new Date(now).getTime())) {
    throw new Error('Invalid backup retention time')
  }

  const prefix = `backups/${input.backupType.toLowerCase()}/`
  const extension = archiveExtensions[input.backupType]
  const timestamp = new Date(now).toISOString().replace(/[:.]/g, '-')
  const key = `${prefix}${timestamp}-${crypto.randomUUID()}${extension}`
  await input.withArchive((archive) =>
    input.storage.uploadAndVerify(key, archive),
  )

  let token: string | undefined
  const seenTokens = new Set<string>()
  const candidates = new Map<string, BackupCandidate>([
    [key, { key, modified: now }],
  ])
  let removed = 0

  try {
    do {
      const page = await input.storage.list(prefix, token)
      const nextToken = page.isTruncated
        ? page.nextContinuationToken
        : undefined

      if (page.isTruncated && (!nextToken || seenTokens.has(nextToken))) {
        throw new Error('Backup listing has no usable continuation token')
      }

      for (const object of page.contents ?? []) {
        const modified = Date.parse(object.lastModified ?? '')
        const filename = object.key.slice(prefix.length)

        if (
          object.key === key ||
          !object.key.startsWith(prefix) ||
          !archiveName.test(filename) ||
          !filename.endsWith(extension) ||
          !Number.isFinite(modified) ||
          modified > now
        ) {
          continue
        }

        const previous = candidates.get(object.key)

        if (!previous || modified > previous.modified) {
          candidates.set(object.key, { key: object.key, modified })
        }
      }

      token = nextToken

      if (token) {
        seenTokens.add(token)
      }
    } while (token)

    const backups = [...candidates.values()].sort(
      (left, right) =>
        right.modified - left.modified || left.key.localeCompare(right.key),
    )
    const retained = retainedKeys(backups, input.retention)
    const cutoff = now - backupRetentionPolicy.minAgeMs
    const prunable = backups
      .filter((backup) => {
        if (backup.modified >= cutoff || backup.key === key) {
          retained.add(backup.key)
        }

        return !retained.has(backup.key)
      })
      .reverse()

    if (!input.dryRun) {
      for (const backup of prunable) {
        await input.storage.remove(backup.key)
        removed += 1
      }
    }

    return {
      key,
      retained: retained.size,
      prunable: prunable.map((backup) => backup.key),
      removed,
    }
  } catch (error) {
    throw new BackupRetentionError(key, error)
  }
}
