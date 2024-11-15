export const serverBaseUrl = Bun.env.SERVER_BASE_URL
export const port = Bun.env.PORT
export const cookieSecret = Bun.env.COOKIE_SECRET
export const cookieMaxAge = Bun.env.COOKIE_MAX_AGE

export const clientBaseUrl = Bun.env.CLIENT_BASE_URL

export const dbRepo = Bun.env.DB_REPO
export const adminPassword = Bun.env.ADMIN_PASSWORD

export const mailerUser = Bun.env.MAILER_USER
export const mailerPass = Bun.env.MAILER_PASS

export const jwtAccessSecret = Bun.env.ACCESS_TOKEN_SECRET
export const jwtRefreshSecret = Bun.env.REFRESH_TOKEN_SECRET
export const jwtAccessExpiration = Bun.env.ACCESS_TOKEN_EXPIRATION
export const jwtRefreshExpiration = Bun.env.REFRESH_TOKEN_EXPIRATION

export const ngrokAuthToken = Bun.env.NGROK_AUTHTOKEN
export const ngrokDomain = Bun.env.NGROK_DOMAIN
