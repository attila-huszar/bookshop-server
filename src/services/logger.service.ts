import { Node as Logtail } from '@logtail/js'
import { env } from '../config'

export const logtail = new Logtail(env.logtailSourceToken!, {
  endpoint: env.logtailIngestingHost,
})
