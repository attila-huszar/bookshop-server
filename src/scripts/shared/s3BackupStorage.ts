import {
  DeleteObjectCommand,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  ListObjectsV2Command,
  type S3Client,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import type { BunFile } from 'bun'
import { log } from '@/libs/logger'
import { backupUploadPolicy } from '@/constants/backup'
import type { BackupStorage } from './backupStorage'

type ChecksumInput = {
  archive: BunFile
  partSize: number
  metadata: Pick<
    HeadObjectCommandOutput,
    'ContentLength' | 'ChecksumSHA256' | 'ChecksumType'
  >
}

async function hashArchive(archive: BunFile): Promise<Buffer> {
  const hash = new Bun.CryptoHasher('sha256')

  for await (const chunk of archive.stream()) {
    hash.update(chunk)
  }

  return hash.digest()
}

export async function verifyBackupChecksum(
  input: ChecksumInput,
): Promise<string> {
  const { archive, partSize, metadata } = input

  if (!metadata.ChecksumSHA256) {
    throw new Error('S3 did not return a SHA-256 checksum')
  }

  if (metadata.ContentLength !== archive.size) {
    throw new Error('S3 backup size does not match the local archive')
  }

  if (!Number.isSafeInteger(partSize) || partSize <= 0) {
    throw new Error('Invalid backup upload part size')
  }

  let checksum: string

  if (metadata.ChecksumType === 'FULL_OBJECT') {
    checksum = (await hashArchive(archive)).toString('base64')
  } else if (metadata.ChecksumType === 'COMPOSITE') {
    const composite = new Bun.CryptoHasher('sha256')
    let parts = 0

    for (let offset = 0; offset < archive.size; offset += partSize) {
      composite.update(
        await hashArchive(archive.slice(offset, offset + partSize)),
      )
      parts += 1
    }

    checksum = `${composite.digest('base64')}-${parts}`
  } else {
    throw new Error('S3 did not return a supported checksum type')
  }

  if (checksum !== metadata.ChecksumSHA256) {
    throw new Error('S3 SHA-256 checksum does not match the local archive')
  }

  return checksum
}

export function createS3BackupStorage(input: {
  client: S3Client
  bucket: string
}): BackupStorage {
  const { client, bucket } = input

  return {
    uploadAndVerify: async (key, archive) => {
      const partSize = Math.max(
        backupUploadPolicy.partSizeBytes,
        Math.ceil(archive.size / backupUploadPolicy.maxParts),
      )
      const upload = new Upload({
        client,
        params: {
          Bucket: bucket,
          Key: key,
          Body: archive.stream(),
          ContentLength: archive.size,
          ContentType: 'application/gzip',
          ChecksumAlgorithm: 'SHA256',
        },
        partSize,
        queueSize: backupUploadPolicy.concurrency,
        leavePartsOnError: false,
      })
      const uploaded = await upload.done()
      const uploadedObject = {
        Bucket: bucket,
        Key: key,
        VersionId: uploaded.VersionId,
      }

      try {
        const metadata = await client.send(
          new HeadObjectCommand({
            ...uploadedObject,
            ChecksumMode: 'ENABLED',
          }),
        )
        await verifyBackupChecksum({ archive, metadata, partSize })
      } catch (error) {
        await client
          .send(new DeleteObjectCommand(uploadedObject))
          .catch((cleanupError: unknown) => {
            log.warn('Failed to remove an unverified backup', {
              error: cleanupError,
              key,
            })
          })

        throw new Error(`S3 backup verification failed for ${key}`, {
          cause: error,
        })
      }
    },
    list: async (prefix, token) => {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      )

      return {
        contents: page.Contents?.map((object) => ({
          key: object.Key ?? '',
          lastModified: object.LastModified?.toISOString(),
        })),
        isTruncated: page.IsTruncated,
        nextContinuationToken: page.NextContinuationToken,
      }
    },
    remove: async (key) => {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    },
  }
}
