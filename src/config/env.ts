export const env = {
  serverBaseUrl: Bun.env.SERVER_BASE_URL ?? 'http://localhost:5000',
  port: Bun.env.PORT ?? '5000',
  cookieSecret: Bun.env.COOKIE_SECRET,
  cookieMaxAge: Bun.env.COOKIE_MAX_AGE ?? '1209600',
  clientBaseUrl: Bun.env.CLIENT_BASE_URL,
  dbRepo: Bun.env.DB_REPO ?? 'SQLITE',
  adminPassword: Bun.env.ADMIN_PASSWORD,
  mailerUser: Bun.env.MAILER_USER,
  mailerPass: Bun.env.MAILER_PASS,
  jwtAccessSecret: Bun.env.ACCESS_TOKEN_SECRET,
  jwtRefreshSecret: Bun.env.REFRESH_TOKEN_SECRET,
  jwtAccessExpiration: Bun.env.ACCESS_TOKEN_EXPIRATION ?? '900',
  jwtRefreshExpiration: Bun.env.REFRESH_TOKEN_EXPIRATION ?? '1209600',
  ngrokAuthToken: Bun.env.NGROK_AUTHTOKEN ?? null,
  ngrokDomain: Bun.env.NGROK_DOMAIN ?? null,
  stripeSecret: Bun.env.STRIPE_SECRET,
  sentryDsn: Bun.env.SENTRY_DSN,
  awsAccessKeyId: Bun.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: Bun.env.AWS_SECRET_ACCESS_KEY,
  awsRegion: Bun.env.AWS_REGION ?? 'eu-central-1',
  awsBucket: Bun.env.AWS_BUCKET,
}
