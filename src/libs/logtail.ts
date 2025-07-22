import { Logtail } from '@logtail/node'
import { env } from '@/config'

export const log = new Logtail(env.logtailServerSourceToken!, {
  endpoint: env.logtailServerIngestingHost,
})

export const logWorker = new Logtail(env.logtailWorkerSourceToken!, {
  endpoint: env.logtailWorkerIngestingHost,
})
