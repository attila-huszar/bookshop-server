const DEFAULT_REDIS_TARGET = {
  host: 'localhost',
  port: '6379',
} as const

export function getRedisConnectionHint(
  error: unknown,
  redisUrl?: string,
): string | null {
  if (!isRedisConnectionError(error)) return null

  const { host, port } = resolveRedisTarget(redisUrl)
  return `Start Redis locally and retry (expected at ${host}:${port})`
}

function resolveRedisTarget(redisUrl?: string): {
  host: string
  port: string
} {
  if (!redisUrl) return { ...DEFAULT_REDIS_TARGET }

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
