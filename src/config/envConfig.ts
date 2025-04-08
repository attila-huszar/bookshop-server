function getEnvVar(key: string, defaultValue?: string | null): string {
  const value = Bun.env[key]

  if (value === undefined || value === '') {
    if (defaultValue !== undefined) {
      console.warn(
        `Environment variable ${key} is not set. Using default: ${defaultValue}`,
      )

      return defaultValue ?? ''
    }

    throw new Error(`Critical error: Environment variable ${key} is not set.`)
  }

  return value
}

export const serverBaseUrl = getEnvVar('SERVER_BASE_URL')
export const port = getEnvVar('PORT', '5000')
export const cookieSecret = getEnvVar('COOKIE_SECRET')
export const cookieMaxAge = getEnvVar('COOKIE_MAX_AGE', '1209600')

export const clientBaseUrl = getEnvVar('CLIENT_BASE_URL')

export const dbRepo = getEnvVar('DB_REPO', 'SQLITE')
export const adminPassword = getEnvVar('ADMIN_PASSWORD', 'admin1')

export const mailerUser = getEnvVar('MAILER_USER')
export const mailerPass = getEnvVar('MAILER_PASS')

export const jwtAccessSecret = getEnvVar('ACCESS_TOKEN_SECRET')
export const jwtRefreshSecret = getEnvVar('REFRESH_TOKEN_SECRET')
export const jwtAccessExpiration = getEnvVar('ACCESS_TOKEN_EXPIRATION', '900')
export const jwtRefreshExpiration = getEnvVar(
  'REFRESH_TOKEN_EXPIRATION',
  '1209600',
)

export const ngrokAuthToken = getEnvVar('NGROK_AUTHTOKEN', null)
export const ngrokDomain = getEnvVar('NGROK_DOMAIN', null)

export const stripeSecret = getEnvVar('STRIPE_SECRET')
export const sentryDsn = getEnvVar('SENTRY_DSN', null)

export const awsAccessKeyId = getEnvVar('AWS_ACCESS_KEY_ID')
export const awsSecretAccessKey = getEnvVar('AWS_SECRET_ACCESS_KEY')
export const awsRegion = getEnvVar('AWS_REGION', 'eu-central-1')
export const awsBucket = getEnvVar('AWS_BUCKET')
