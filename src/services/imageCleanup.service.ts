import { s3 } from 'bun'
import { env } from '@/config/env'
import { booksDB, usersDB } from '@/repositories'
import { imageStoragePrefix, storedImageUrl } from '@/utils/file.utils'
import { Folder } from '@/types/enums'

const IMAGE_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000
const generatedFilename =
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.webp$/

type ImageListing = {
  contents?: { key: string; lastModified?: string }[]
  isTruncated?: boolean
  nextContinuationToken?: string
}

type CleanupInput = {
  prefixes: string[]
  readReferences: () => Promise<(string | null)[]>
  list: (prefix: string, token?: string) => Promise<ImageListing>
  remove: (key: string) => Promise<void>
  urlForKey: (key: string) => string
  now?: number
}

function canonicalUrl(value: string): string {
  const url = new URL(value)
  url.search = ''
  url.hash = ''

  return url.href
}

/** Only this application's generated objects in the selected database namespace. */
export async function collectUnusedImages(
  input: CleanupInput,
): Promise<number> {
  const cutoff = (input.now ?? Date.now()) - IMAGE_GRACE_PERIOD_MS
  let removed = 0

  for (const prefix of input.prefixes) {
    let token: string | undefined

    do {
      const page = await input.list(prefix, token)

      for (const object of page.contents ?? []) {
        const modified = Date.parse(object.lastModified ?? '')

        if (
          !object.key.startsWith(prefix) ||
          !generatedFilename.test(object.key.slice(prefix.length)) ||
          !Number.isFinite(modified) ||
          modified >= cutoff
        ) {
          continue
        }

        // Refresh immediately before deletion, including references shared across entities.
        // A failed read aborts cleanup; no incomplete reference snapshot is used.
        const references = await input.readReferences()
        const target = canonicalUrl(input.urlForKey(object.key))
        const inUse = references.some((reference) => {
          if (!reference) {
            return false
          }

          try {
            return canonicalUrl(reference) === target
          } catch {
            return false
          }
        })

        if (!inUse) {
          await input.remove(object.key)
          removed += 1
        }
      }

      token = page.isTruncated ? page.nextContinuationToken : undefined

      if (page.isTruncated && !token) {
        throw new Error(
          'Image listing was truncated without a continuation token',
        )
      }
    } while (token)
  }

  return removed
}

export async function cleanupUnusedImages(): Promise<number> {
  if (!env.awsBucket) {
    return 0
  }

  return collectUnusedImages({
    prefixes: [
      imageStoragePrefix(Folder.Avatars),
      imageStoragePrefix(Folder.ProductImages),
    ],
    readReferences: async () => {
      const [books, users] = await Promise.all([
        booksDB.getImageUrls(),
        usersDB.getImageUrls(),
      ])

      return [...books, ...users]
    },
    list: (prefix, continuationToken) => s3.list({ prefix, continuationToken }),
    remove: (key) => s3.delete(key),
    urlForKey: storedImageUrl,
  })
}
