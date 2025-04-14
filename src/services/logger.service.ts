import { Logtail } from '@logtail/node'
import { env } from '../config'

export const logtail = new Logtail(env.logtailSourceToken!, {
  endpoint: env.logtailIngestingHost,
})
