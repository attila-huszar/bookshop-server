type ParsedMongoURI = {
  origin: string
  isSRV: boolean
  username?: string
  hosts: string[]
  database: string
  searchParams: URLSearchParams
}

function validateHost(host: string, isSRV: boolean): void {
  const decoded = decodeURIComponent(host)

  if (!isSRV && decoded.startsWith('/') && decoded.endsWith('.sock')) {
    if (decoded.includes('\0')) {
      throw new Error('Invalid MongoDB socket path')
    }

    return
  }

  const match = /^(\[[^\]]+\]|[^:[\]]+)(?::([0-9]+))?$/.exec(host)

  if (!match || (isSRV && (match[2] || host.startsWith('[')))) {
    throw new Error('Invalid MongoDB host')
  }

  // Use a special URL scheme so the native parser validates IPv6 and ports.
  // Keep the original host for serialization, including its encoded form.
  new URL(`http://${host}`)

  if (match[2] && Number(match[2]) === 0) {
    throw new Error('Invalid MongoDB port')
  }
}

export function parseMongoURI(uri: string): ParsedMongoURI {
  try {
    const match =
      /^(mongodb(?:\+srv)?):\/\/([^/?#]+)(?:\/([^?#]*))?(?:\?([^#]*))?$/.exec(
        uri,
      )

    if (!match || /[\s\\\p{Cc}]/u.test(uri)) {
      throw new Error('Invalid MongoDB URI syntax')
    }

    // URLSearchParams tolerates malformed escapes; configuration must not.
    decodeURIComponent(uri)

    const [, protocol, authority, path = '', query = ''] = match
    const isSRV = protocol === 'mongodb+srv'
    const separator = authority!.lastIndexOf('@')
    let username: string | undefined

    if (separator !== -1) {
      const credentials = authority!.slice(0, separator)
      const [user, password = '', ...extra] = credentials.split(':')

      if (!user || extra.length || /[@[\]$]/.test(credentials)) {
        throw new Error('Invalid MongoDB credentials')
      }

      username = decodeURIComponent(user)

      if (
        username.includes('\0') ||
        decodeURIComponent(password).includes('\0')
      ) {
        throw new Error('Invalid MongoDB credentials')
      }
    }

    const hosts = authority!.slice(separator + 1).split(',')

    if (isSRV && hosts.length !== 1) {
      throw new Error('MongoDB SRV requires a single host')
    }

    for (const host of hosts) {
      validateHost(host, isSRV)
    }

    const database = decodeURIComponent(path)

    if (/[/\\\0]/.test(database)) {
      throw new Error('Invalid MongoDB database path')
    }

    return {
      origin: `${protocol}://${authority}`,
      isSRV,
      username,
      hosts,
      database,
      searchParams: new URLSearchParams(query),
    }
  } catch {
    // Native parsing errors may include the input URI and its credentials.
    throw new Error('Invalid MongoDB connection string')
  }
}

export function getMongoUriOption(
  options: URLSearchParams,
  name: string,
): string | null {
  const normalized = name.toLowerCase()

  for (const [key, value] of options) {
    if (key.toLowerCase() === normalized) {
      return value
    }
  }

  return null
}
