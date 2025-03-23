import { Hono } from 'hono'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { s3 } from '../services'
import { awsBucket, awsRegion } from '../config/envConfig'
import { MAX_FILE_SIZE } from '../constants'
//import * as DB from '../repository'
//import * as Errors from '../errors'

export const upload = new Hono()

upload.post('/', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('avatar')

    if (!file) {
      return c.json({ error: 'No avatar field in the form data' }, 400)
    }

    if (!(file instanceof File)) {
      return c.json({ error: 'Avatar field is not a file' }, 400)
    }

    if (!file.type.startsWith('image/')) {
      return c.json({ error: 'Invalid file type' }, 400)
    }

    if (file.size > MAX_FILE_SIZE) {
      return c.json({ error: 'File too large (max 512 KB)' }, 400)
    }

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

    const fileUrl = `https://${awsBucket}.s3.${awsRegion}.amazonaws.com/${s3Key}`

    return c.json({ url: fileUrl })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    )
  }
})
