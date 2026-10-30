import { s3, write } from 'bun'
import { env } from '@/config/env'
import { Folder } from '@/types/enums'
import { prepareImage } from './image.utils'

export function imageStoragePrefix(folder: Folder): string {
  return `${folder}/${env.dbRepo.toLowerCase()}/`
}

export function storedImageUrl(key: string): string {
  const url = new URL(s3.file(key).presign())
  url.search = ''
  url.hash = ''

  return url.href
}

export const uploadFile = async (
  file: File,
  folder: Folder,
): Promise<string> => {
  const image = await prepareImage(file)

  try {
    const key = `${imageStoragePrefix(folder)}${crypto.randomUUID()}.webp`
    const metadata = s3.file(key)

    await write(metadata, image)

    return storedImageUrl(key)
  } catch (error) {
    throw new Error('Failed to upload file', { cause: error })
  }
}
