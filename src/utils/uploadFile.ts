import { s3, write } from 'bun'
import { log } from '@/libs'

export const uploadFile = async (file: File) => {
  try {
    const key = `avatars/${Date.now()}-${file.name}`
    const metadata = s3.file(key)

    await write(metadata, file)
    const presignedUrl = metadata.presign()
    const permanentUrl = presignedUrl.split('?')[0]

    return permanentUrl
  } catch (error) {
    void log.error('Error uploading to AWS', {
      error,
      file: file.name,
    })
    throw new Error('Failed to upload file')
  }
}
