import { describe, expect, it } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { withBackupArchive } from '@/scripts/shared/backupArchive'
import {
  createS3BackupStorage,
  verifyBackupChecksum,
} from '@/scripts/shared/s3BackupStorage'
import { S3Client } from '@aws-sdk/client-s3'
import type { BunFile } from 'bun'
import { backupUploadPolicy } from '@/constants/backup'
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
  it('cancels active upload requests and waits for them before aborting multipart storage', async () => {
    const controller = new AbortController()
    const requests: string[] = []
    let activeParts = 0
    const client = new S3Client({
      region: 'us-east-1',
      maxAttempts: 1,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    })

    // Exercise the SDK uploader and request pipeline with a controlled transport.
    client.config.requestHandler = {
      handle: async (
        request: { method: string },
        options?: { abortSignal?: unknown },
      ) => {
        requests.push(request.method)

        if (request.method === 'POST') {
          return {
            response: {
              statusCode: 200,
              headers: { 'content-type': 'application/xml' },
              body: Readable.from([
                '<InitiateMultipartUploadResult><UploadId>fixture-upload</UploadId></InitiateMultipartUploadResult>',
              ]),
            },
          }
        }

        if (request.method === 'PUT') {
          const requestSignal = options?.abortSignal
          expect(requestSignal).toBe(controller.signal)

          if (!(requestSignal instanceof AbortSignal)) {
            throw new Error('Upload request has no abort signal')
          }

          activeParts += 1
          const interrupted = Promise.withResolvers<never>()
          const onAbort = () =>
            interrupted.reject(
              Object.assign(new Error('Upload request interrupted'), {
                name: 'AbortError',
              }),
            )

          if (requestSignal.aborted) {
            onAbort()
          } else {
            requestSignal.addEventListener('abort', onAbort, {
              once: true,
            })
          }

          controller.abort()

          return interrupted.promise.finally(() => {
            activeParts -= 1
          })
        }

        expect(request.method).toBe('DELETE')
        expect(activeParts).toBe(0)
        expect(options?.abortSignal).toBeUndefined()

        return {
          response: { statusCode: 204, headers: {}, body: Readable.from([]) },
        }
      },
    }

    const storage = createS3BackupStorage({
      client,
      bucket: 'test-bucket',
      signal: controller.signal,
    })

    try {
      await withFile(
        Buffer.alloc(backupUploadPolicy.partSizeBytes + 1, 42),
        async (archive) => {
          await rejects(
            storage.uploadAndVerify(
              'backups/sqlite/cancelled.sqlite.gz',
              archive,
            ),
            /Upload request interrupted/,
          )
        },
      )

      expect(activeParts).toBe(0)
      expect(requests).toContain('PUT')
      expect(requests.at(-1)).toBe('DELETE')
      expect(requests.filter((method) => method === 'DELETE')).toHaveLength(1)
    } finally {
      client.destroy()
    }
  })

  it.each([
    { outcome: 'success', size: backupUploadPolicy.partSizeBytes + 1 },
    { outcome: 'success', size: backupUploadPolicy.partSizeBytes * 2 },
    { outcome: 'part-failure', size: backupUploadPolicy.partSizeBytes + 1 },
    { outcome: 'complete-failure', size: backupUploadPolicy.partSizeBytes + 1 },
    { outcome: 'abort-failure', size: backupUploadPolicy.partSizeBytes + 1 },
    { outcome: 'already-aborted', size: backupUploadPolicy.partSizeBytes + 1 },
    { outcome: 'checksum-failure', size: backupUploadPolicy.partSizeBytes + 1 },
  ])(
    'handles multipart $outcome for $size bytes',
    async ({ outcome, size }) => {
      const bytes = Buffer.alloc(size, 42)
      const calls: { method: string; query: URLSearchParams }[] = []
      const checksums = new Map<number, Buffer>()
      const key = 'backups/sqlite/multipart.sqlite.gz'
      let completion = ''
      const denied = () =>
        new Response(
          '<Error><Code>AccessDenied</Code><Message>Upload fixture failed</Message></Error>',
          { status: 403 },
        )
      const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: async (request) => {
          const query = new URL(request.url).searchParams
          calls.push({ method: request.method, query })

          if (request.method === 'POST' && query.has('uploads')) {
            return new Response(
              '<InitiateMultipartUploadResult><UploadId>fixture-upload</UploadId></InitiateMultipartUploadResult>',
              { headers: { 'content-type': 'application/xml' } },
            )
          }

          if (request.method === 'PUT') {
            if (outcome === 'part-failure') {
              return denied()
            }

            const part = Number(query.get('partNumber'))
            const body = Buffer.from(await request.arrayBuffer())
            const checksum = createHash('sha256').update(body).digest()
            checksums.set(part, checksum)
            expect(body).toEqual(
              bytes.subarray(
                (part - 1) * backupUploadPolicy.partSizeBytes,
                part * backupUploadPolicy.partSizeBytes,
              ),
            )
            expect(request.headers.get('x-amz-checksum-sha256')).toBe(
              checksum.toString('base64'),
            )

            return new Response('', {
              headers: {
                etag: `"part-${part}"`,
                'x-amz-checksum-sha256': checksum.toString('base64'),
              },
            })
          }

          if (request.method === 'POST') {
            completion = await request.text()

            if (
              outcome === 'complete-failure' ||
              outcome === 'abort-failure' ||
              outcome === 'already-aborted'
            ) {
              return denied()
            }

            return new Response(
              '<CompleteMultipartUploadResult><ETag>"fixture"</ETag></CompleteMultipartUploadResult>',
              {
                headers: {
                  'content-type': 'application/xml',
                  'x-amz-version-id': 'fixture-version',
                },
              },
            )
          }

          if (request.method === 'HEAD') {
            const parts = [...checksums.entries()]
              .sort(([left], [right]) => left - right)
              .map(([, checksum]) => checksum)
            const checksum = `${createHash('sha256').update(Buffer.concat(parts)).digest('base64')}-${parts.length}`

            return new Response(null, {
              headers: {
                'content-length': String(size),
                'x-amz-checksum-type': 'COMPOSITE',
                'x-amz-checksum-sha256':
                  outcome === 'checksum-failure' ? 'incorrect' : checksum,
              },
            })
          }

          if (request.method === 'DELETE' && outcome === 'abort-failure') {
            return new Response(
              '<Error><Code>AccessDenied</Code><Message>Cleanup fixture failed</Message></Error>',
              { status: 403 },
            )
          }

          if (request.method === 'DELETE' && outcome === 'already-aborted') {
            return new Response('<Error><Code>NoSuchUpload</Code></Error>', {
              status: 404,
            })
          }

          return new Response(null, { status: 204 })
        },
      })
      const client = new S3Client({
        region: 'us-east-1',
        endpoint: `http://127.0.0.1:${server.port}`,
        forcePathStyle: true,
        maxAttempts: 1,
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      })
      const storage = createS3BackupStorage({ client, bucket: 'test-bucket' })

      try {
        await withFile(bytes, async (archive) => {
          const upload = storage.uploadAndVerify(key, archive)

          if (outcome === 'success') {
            await upload
          } else {
            await rejects(
              upload,
              outcome === 'checksum-failure'
                ? /verification failed/
                : /Upload fixture failed/,
            )
          }
        })

        const deletes = calls.filter((call) => call.method === 'DELETE')
        const heads = calls.filter((call) => call.method === 'HEAD')

        if (outcome === 'success' || outcome === 'checksum-failure') {
          expect(checksums.size).toBe(2)
          expect(completion).toContain('<PartNumber>1</PartNumber>')
          expect(completion).toContain('<PartNumber>2</PartNumber>')

          for (const checksum of checksums.values()) {
            expect(completion).toContain(
              `<ChecksumSHA256>${checksum.toString('base64')}</ChecksumSHA256>`,
            )
          }

          expect(heads).toHaveLength(1)
          expect(heads[0]!.query.get('versionId')).toBe('fixture-version')
          expect(deletes).toHaveLength(outcome === 'success' ? 0 : 1)

          if (outcome === 'checksum-failure') {
            expect(deletes[0]!.query.get('versionId')).toBe('fixture-version')
            expect(deletes[0]!.query.has('uploadId')).toBe(false)
          }
        } else {
          expect(heads).toHaveLength(0)
          expect(deletes).toHaveLength(1)
          expect(deletes[0]!.query.get('uploadId')).toBe('fixture-upload')
          expect(deletes[0]!.query.has('versionId')).toBe(false)
          expect(calls.at(-1)!.method).toBe('DELETE')
        }
      } finally {
        client.destroy()
        await server.stop(true)
      }
    },
  )

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
