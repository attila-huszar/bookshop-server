import { defineConfig } from 'drizzle-kit'
import { env } from '@/config'
import { MIGRATIONS_DIR, MODELS_DIR } from './src/constants/'

const dbType = 'sqlite'

export default defineConfig({
  dialect: dbType,
  dbCredentials: {
    url: `file:${env.dbSqliteFile}`,
  },
  out: MIGRATIONS_DIR,
  schema: `${MODELS_DIR}/${dbType}`,
})
