type RedisConnectionHint = {
  host: string
  port: string
  redisUrl: string
  hint: string
}

export function getRedisConnectionHint(
  error: unknown,
  redisUrl: string,
): RedisConnectionHint | null {
  if (!isRedisConnectionError(error)) return null

  let host = 'localhost'
  let port = '6379'

  try {
    const parsedRedisUrl = new URL(redisUrl)
    host = parsedRedisUrl.hostname || host
    port = parsedRedisUrl.port || port
  } catch {
    // Keep fallback host/port for malformed REDIS_URL values.
  }

  return {
    redisUrl,
    host,
    port,
    hint: `Start Redis locally and retry (expected at ${host}:${port}), or update REDIS_URL in .env`,
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
