import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { BunFile } from 'bun'
import { mongo } from 'mongoose'
import { parseMongoURI } from '@/utils/db.utils'
import { backupTiming } from '@/constants/backup'
import { DB_REPO } from '@/types/enums'
import {
  waitForProcessExitWithTimeout,
  withBackupArchive,
} from './backupArchive'

async function readCatalog(db: mongo.Db, signal: AbortSignal) {
  const options = { promoteValues: false, signal }
  const collections = await db
    .listCollections({}, { ...options, nameOnly: false })
    .toArray()
  const catalog = new Map<string, string>()

  for (const collection of collections) {
    if (collection.name.startsWith('system.')) {
      continue
    }
    if (collection.type !== 'collection') {
      throw new Error('Mongo logical backup requires ordinary collections')
    }

    const indexes = await db
      .collection(collection.name)
      .listIndexes(options)
      .toArray()
    const metadata = mongo.BSON.EJSON.stringify(
      {
        options: collection.options,
        indexes,
        uuid: collection.info?.uuid?.toString('hex'),
        collectionName: collection.name,
      },
      { relaxed: false },
    )
    catalog.set(collection.name, metadata)
  }

  return catalog
}

async function writeDump(input: {
  uri: string
  database: string
  directory: string
  signal: AbortSignal
}): Promise<void> {
  const client = new mongo.MongoClient(input.uri, {
    connectTimeoutMS: backupTiming.connectionTimeoutMs,
    serverSelectionTimeoutMS: backupTiming.connectionTimeoutMs,
    maxPoolSize: 1,
  })

  try {
    const db = client.db(input.database)
    const catalog = await readCatalog(db, input.signal)

    if (catalog.size === 0) {
      throw new Error('Mongo logical backup found no collections')
    }

    const session = client.startSession({ snapshot: true })

    try {
      for (const [name, metadata] of catalog) {
        const collectionFile = join(input.directory, encodeURIComponent(name))
        const cursor = db.collection(name).find(
          {},
          {
            raw: true,
            session,
            signal: input.signal,
          },
        )

        try {
          await pipeline(
            cursor,
            createWriteStream(`${collectionFile}.bson`, {
              flags: 'wx',
              mode: 0o600,
            }),
            { signal: input.signal },
          )
        } finally {
          await cursor.close()
        }

        await writeFile(`${collectionFile}.metadata.json`, metadata, {
          flag: 'wx',
          mode: 0o600,
          signal: input.signal,
        })
      }
    } finally {
      await session.endSession()
    }

    // Catalog commands run outside the snapshot. Reject schema changes seen
    // during the export so the BSON and restore metadata describe the same DB.
    const currentCatalog = await readCatalog(db, input.signal)
    const catalogChanged =
      currentCatalog.size !== catalog.size ||
      [...catalog].some(
        ([name, metadata]) => currentCatalog.get(name) !== metadata,
      )

    if (catalogChanged) {
      throw new Error('Mongo collections or indexes changed during backup')
    }
  } finally {
    await client.close()
  }
}

export async function withMongoLogicalArchive(input: {
  uri: string
  consume: (archive: BunFile) => Promise<void>
  signal?: AbortSignal
}): Promise<void> {
  input.signal?.throwIfAborted()
  const { database } = parseMongoURI(input.uri)

  if (!database || database.includes('.')) {
    throw new Error(
      'Mongo logical backups require a valid database in DB_MONGO_URL',
    )
  }

  await withBackupArchive({
    backupType: DB_REPO.MONGO,
    signal: input.signal,
    create: async ({ directory, outputFile }) => {
      const deadline = AbortSignal.timeout(backupTiming.processTimeoutMs)
      const signal = input.signal
        ? AbortSignal.any([input.signal, deadline])
        : deadline
      const dumpDirectory = join(directory, 'dump', database)
      await mkdir(dumpDirectory, { recursive: true, mode: 0o700 })
      await writeDump({
        uri: input.uri,
        database,
        directory: dumpDirectory,
        signal,
      })

      signal.throwIfAborted()
      const tar = Bun.spawn({
        cmd: ['tar', '-czf', outputFile, '-C', directory, 'dump'],
        stdout: 'inherit',
        stderr: 'inherit',
      })
      const code = await waitForProcessExitWithTimeout(
        'Mongo logical archive',
        tar,
        undefined,
        signal,
      )

      if (code !== 0) {
        throw new Error(`Mongo logical archive exited with code ${code}`)
      }
    },
    consume: input.consume,
  })
}
