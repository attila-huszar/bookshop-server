import type { EventEmitter } from 'node:events'
import { log } from '@/libs/logger'
import { getErrorCode } from './error.utils'

type Connection = Pick<EventEmitter, 'on'> & { readonly status: string }

const DEFAULT_REDIS_TARGET = {
  host: 'localhost',
  port: '6379',
} as const

const knownRedisCodes = new Set([
  'econnrefused',
  'enotfound',
  'eai_again',
  'etimedout',
  'econnreset',
  'epipe',
  'ehostunreach',
  'enetunreach',
])

const knownRedisMessageFragments = [
  'econnrefused',
  'connection is closed',
  'connect etimedout',
  'getaddrinfo enotfound',
]

export function getRedisConnectionHint(
  error: unknown,
  redisUrl?: string,
): string | null {
  if (!isRedisConnectionError(error)) {
    return null
  }

  const { host, port } = resolveRedisTarget(redisUrl)

  return `Check Redis availability at ${host}:${port}; reconnection is automatic`
}

/** Observe every worker connection; a single ready socket is not full recovery. */
export function monitorRedisRecovery(input: {
  name: string
  backend: { connection: Connection; blockingConnection?: Connection }
  redisUrl?: string
  isClosing: () => boolean
}): (error: unknown) => boolean {
  const connections = [input.backend.connection]

  if (input.backend.blockingConnection) {
    connections.push(input.backend.blockingConnection)
  }

  const ready = connections.map((connection) => connection.status === 'ready')
  let outageReported = false

  const reportOutage = (hint?: string) => {
    if (input.isClosing() || outageReported) {
      return
    }

    outageReported = true
    log.warn(`⚠️ ${input.name} Redis connection lost; reconnecting`, { hint })
  }

  for (const [index, connection] of connections.entries()) {
    connection.on('close', () => {
      ready[index] = false
      reportOutage()
    })

    connection.on('error', (error: unknown) => {
      if (isRedisConnectionError(error)) {
        ready[index] = false
      }
    })

    connection.on('ready', () => {
      ready[index] = true

      if (outageReported && ready.every(Boolean) && !input.isClosing()) {
        outageReported = false
        log.info(`✅ ${input.name} Redis connection recovered`)
      }
    })
  }

  return (error) => {
    const hint = getRedisConnectionHint(error, input.redisUrl)

    if (!hint) {
      return false
    }

    reportOutage(hint)

    return true
  }
}

function resolveRedisTarget(redisUrl?: string): {
  host: string
  port: string
} {
  if (!redisUrl) {
    return { ...DEFAULT_REDIS_TARGET }
  }

  try {
    const parsedRedisUrl = new URL(redisUrl)

    return {
      host: parsedRedisUrl.hostname || DEFAULT_REDIS_TARGET.host,
      port: parsedRedisUrl.port || DEFAULT_REDIS_TARGET.port,
    }
  } catch {
    return { ...DEFAULT_REDIS_TARGET }
  }
}

function isRedisConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  const code = String(getErrorCode(error) ?? '').toLowerCase()

  return (
    knownRedisCodes.has(code) ||
    knownRedisMessageFragments.some((fragment) => message.includes(fragment))
  )
}
