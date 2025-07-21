import { Logtail } from '@logtail/node'
import { env } from '../config'

export const logtailServer = new Logtail(env.logtailServerSourceToken!, {
  endpoint: env.logtailServerIngestingHost,
})

export const logtailWorker = new Logtail(env.logtailWorkerSourceToken!, {
  endpoint: env.logtailWorkerIngestingHost,
})
