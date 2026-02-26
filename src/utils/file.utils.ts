import { s3, write } from 'bun'
import { log } from '@/libs'

export const enum Folder {
  Avatars = 'avatars',
  ProductImages = 'product-images',
}

export const uploadFile = async (
  file: File,
  folder: Folder,
): Promise<string> => {
  try {
    const key = `${folder}/${Date.now()}-${file.name}`
    const metadata = s3.file(key)

    await write(metadata, file)
    const presignedUrl = metadata.presign()
    const permanentUrl = presignedUrl.split('?')[0]

    if (!permanentUrl) {
      throw new Error('Failed to get permanent URL after upload')
    }

    return permanentUrl
  } catch (error) {
    void log.error('Error uploading to S3', {
      error,
      file: file.name,
    })
    throw new Error('Failed to upload file', { cause: error })
  }
}
