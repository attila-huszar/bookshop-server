import { PutObjectCommand } from '@aws-sdk/client-s3'
import { s3 } from '../services'
import { env } from '../config'

export const uploadFile = async (file: File) => {
  try {
    const fileBuffer = await file.arrayBuffer()

    const s3Key = `avatars/${Date.now()}-${file.name}`

    await s3.send(
      new PutObjectCommand({
        Bucket: env.awsBucket,
        Key: s3Key,
        Body: Buffer.from(fileBuffer),
        ContentType: file.type,
      }),
    )

    return `https://${env.awsBucket}.s3.${env.awsRegion}.amazonaws.com/${s3Key}`
  } catch (error) {
    console.error('Error uploading file:', error)
    throw new Error('Failed to upload file')
  }
}
