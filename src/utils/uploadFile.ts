import { PutObjectCommand } from '@aws-sdk/client-s3'
import { s3 } from '../services'
import { awsBucket, awsRegion } from '../config/envConfig'

export const uploadFile = async (file: File) => {
  try {
    const fileBuffer = await file.arrayBuffer()

    const s3Key = `avatars/${Date.now()}-${file.name}`

    await s3.send(
      new PutObjectCommand({
        Bucket: awsBucket,
        Key: s3Key,
        Body: Buffer.from(fileBuffer),
        ContentType: file.type,
      }),
    )

    return `https://${awsBucket}.s3.${awsRegion}.amazonaws.com/${s3Key}`
  } catch (error) {
    console.error('Error uploading file:', error)
    throw new Error('Failed to upload file')
  }
}
