type RedisConnectionHint = {
  host: string
  port: string
  redactedRedisUrl: string
  hint: string
}

const DEFAULT_REDIS_TARGET = {
  protocol: 'redis:',
  host: 'localhost',
  port: '6379',
} as const

export function getRedisConnectionHint(
  error: unknown,
  redisUrl?: string,
): RedisConnectionHint | null {
  if (!isRedisConnectionError(error)) return null

  const { protocol, host, port } = resolveRedisTarget(redisUrl)

  const redactedRedisUrl = `${protocol}//${formatHostForUrl(host)}:${port}`

  return {
    redactedRedisUrl,
    host,
    port,
    hint: `Start Redis locally and retry (expected at ${host}:${port})`,
  }
}

function resolveRedisTarget(redisUrl?: string): {
  protocol: string
  host: string
  port: string
} {
  if (!redisUrl) return { ...DEFAULT_REDIS_TARGET }

  try {
    const parsedRedisUrl = new URL(redisUrl)
    return {
      protocol: parsedRedisUrl.protocol || DEFAULT_REDIS_TARGET.protocol,
      host: parsedRedisUrl.hostname || DEFAULT_REDIS_TARGET.host,
      port: parsedRedisUrl.port || DEFAULT_REDIS_TARGET.port,
    }
  } catch {
    return { ...DEFAULT_REDIS_TARGET }
  }
}

function formatHostForUrl(host: string): string {
  if (host.includes(':') && !host.startsWith('[') && !host.endsWith(']')) {
    return `[${host}]`
  }

  return host
}

function isRedisConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  const code =
    'code' in error
      ? String((error as Error & { code?: unknown }).code).toLowerCase()
      : ''

  return (
    code === 'econnrefused' ||
    code === 'enotfound' ||
    code === 'eai_again' ||
    message.includes('connect') ||
    message.includes('econnrefused') ||
    message.includes('connection is closed')
  )
}
