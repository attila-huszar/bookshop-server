import { Logger } from 'seq-logging'
import { env } from '@/config'

const createLogger = () => {
  const seq = new Logger({
    serverUrl: env.seqUrl,
    apiKey: env.seqApiKey,
    onError: (error) => console.error('❌ Seq error:', error.message),
  })

  return {
    info: (message: string, properties?: Record<string, unknown>) => {
      seq.emit({
        timestamp: new Date(),
        level: 'Information',
        messageTemplate: message,
        properties: properties ?? {},
      })
    },

    warn: (message: string, properties?: Record<string, unknown>) => {
      seq.emit({
        timestamp: new Date(),
        level: 'Warning',
        messageTemplate: message,
        properties: properties ?? {},
      })
    },

    error: (message: string, properties?: Record<string, unknown>) => {
      seq.emit({
        timestamp: new Date(),
        level: 'Error',
        messageTemplate: message,
        properties: properties ?? {},
      })
    },

    debug: (message: string, properties?: Record<string, unknown>) => {
      seq.emit({
        timestamp: new Date(),
        level: 'Debug',
        messageTemplate: message,
        properties: properties ?? {},
      })
    },

    flush: () => seq.flush(),
    close: () => seq.close(),
  } as const
}

export const log = createLogger()
