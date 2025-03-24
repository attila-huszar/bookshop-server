import { Hono } from 'hono'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { s3 } from '../services'
import { awsBucket, awsRegion } from '../config/envConfig'
import { MAX_FILE_SIZE } from '../constants'
import * as DB from '../repository'
import * as Errors from '../errors'

type Variables = {
  jwtPayload: {
    uuid: string
  }
}

export const upload = new Hono<{ Variables: Variables }>()

upload.post('/', async (c) => {
  try {
    const jwtPayload = c.get('jwtPayload')

    const user = await DB.getUserBy('uuid', jwtPayload.uuid)

    if (!user) {
      throw new Error(Errors.messages.retrieveError)
    }

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

    const userUpdated = await DB.updateUser(user.email, {
      avatar: fileUrl,
      updatedAt: new Date().toISOString(),
    })

    if (!userUpdated) {
      throw new Error(Errors.messages.updateError)
    }

    return c.json(userUpdated)
  } catch (error) {
    return Errors.Handler(c, error)
  }
})
