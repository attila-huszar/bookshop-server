import { S3Client } from '@aws-sdk/client-s3'
import {
  awsAccessKeyId,
  awsSecretAccessKey,
  awsRegion,
} from '../config/envConfig'

export const s3 = new S3Client({
  region: awsRegion,
  credentials: {
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
  },
})
