import { describe, expect, it } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { withBackupArchive } from '@/scripts/shared/backupHelpers'
import {
  createS3BackupStorage,
  verifyBackupChecksum,
} from '@/scripts/shared/s3BackupStorage'
import { S3Client } from '@aws-sdk/client-s3'
import type { BunFile } from 'bun'
import { DB_REPO } from '@/types/enums'

const abcChecksum = 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0='

async function withFile(
  bytes: Uint8Array,
  consume: (archive: BunFile) => Promise<void>,
) {
  await withBackupArchive({
    backupType: DB_REPO.SQLITE,
    create: async ({ outputFile }) => {
      await Bun.write(outputFile, bytes)
    },
    consume,
  })
}

describe('backup SHA-256 verification', () => {
  it('compares a full-object checksum with a local createHash digest', async () => {
    await withFile(Buffer.from('abc'), async (archive) => {
      expect(
        await verifyBackupChecksum({
          archive,
          partSize: 8,
          metadata: {
            ContentLength: 3,
            ChecksumType: 'FULL_OBJECT',
            ChecksumSHA256: abcChecksum,
          },
        }),
      ).toBe(abcChecksum)
    })
  })

  it.each([1, 7, 8, 14, 15, 140000, 140001])(
    'verifies a composite checksum for %s bytes across part and stream boundaries',
    async (size) => {
      const bytes = Buffer.alloc(size)

      for (let index = 0; index < size; index++) {
        bytes[index] = index % 251
      }

      const partSize = size < 20 ? 7 : 70000
      const parts: Buffer[] = []

      for (let offset = 0; offset < size; offset += partSize) {
        parts.push(
          createHash('sha256')
            .update(bytes.subarray(offset, offset + partSize))
            .digest(),
        )
      }

      const checksum = `${createHash('sha256').update(Buffer.concat(parts)).digest('base64')}-${parts.length}`
      await withFile(bytes, async (archive) => {
        expect(
          await verifyBackupChecksum({
            archive,
            partSize,
            metadata: {
              ContentLength: size,
              ChecksumType: 'COMPOSITE',
              ChecksumSHA256: checksum,
            },
          }),
        ).toBe(checksum)
      })
    },
  )

  it.each([
    { ContentLength: 3, ChecksumType: 'FULL_OBJECT' as const },
    {
      ContentLength: 2,
      ChecksumType: 'FULL_OBJECT' as const,
      ChecksumSHA256: abcChecksum,
    },
    {
      ContentLength: 3,
      ChecksumType: 'FULL_OBJECT' as const,
      ChecksumSHA256: 'incorrect',
    },
    {
      ContentLength: 3,
      ChecksumType: 'COMPOSITE' as const,
      ChecksumSHA256: abcChecksum,
    },
    { ContentLength: 3, ChecksumSHA256: abcChecksum },
  ])(
    'rejects missing or inconsistent S3 checksum metadata: %j',
    async (metadata) => {
      await withFile(Buffer.from('abc'), async (archive) => {
        await rejects(verifyBackupChecksum({ archive, partSize: 8, metadata }))
      })
    },
  )
})

describe('S3 backup adapter', () => {
  it.each([true, false])(
    'requests upload checksums and checksum metadata; valid checksum: %s',
    async (validChecksum) => {
      const calls: {
        method: string
        path: string
        algorithm: string | null
        mode: string | null
      }[] = []
      const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: async (request) => {
          calls.push({
            method: request.method,
            path: new URL(request.url).pathname,
            algorithm: request.headers.get('x-amz-sdk-checksum-algorithm'),
            mode: request.headers.get('x-amz-checksum-mode'),
          })

          if (request.method === 'PUT') {
            expect(await request.text()).toBe('abc')

            return new Response('', { headers: { etag: '"fixture"' } })
          }

          if (request.method === 'HEAD') {
            return new Response(null, {
              headers: {
                'content-length': '3',
                'x-amz-checksum-type': 'FULL_OBJECT',
                'x-amz-checksum-sha256': validChecksum
                  ? abcChecksum
                  : 'incorrect',
              },
            })
          }

          return new Response(null, { status: 204 })
        },
      })
      const client = new S3Client({
        region: 'us-east-1',
        endpoint: `http://127.0.0.1:${server.port}`,
        forcePathStyle: true,
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      })
      const storage = createS3BackupStorage({ client, bucket: 'test-bucket' })
      const key = 'backups/sqlite/fixture.sqlite.gz'

      try {
        await withFile(Buffer.from('abc'), async (archive) => {
          if (validChecksum) {
            await storage.uploadAndVerify(key, archive)
          } else {
            await rejects(
              storage.uploadAndVerify(key, archive),
              /verification failed/,
            )
          }
        })

        expect(calls.map((call) => call.method)).toEqual(
          validChecksum ? ['PUT', 'HEAD'] : ['PUT', 'HEAD', 'DELETE'],
        )
        expect(calls[0]?.algorithm).toBe('SHA256')
        expect(calls[1]?.mode).toBe('ENABLED')
        expect(calls.every((call) => call.path === `/test-bucket/${key}`)).toBe(
          true,
        )
      } finally {
        client.destroy()
        await server.stop(true)
      }
    },
  )
})
