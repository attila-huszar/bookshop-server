import { defineConfig } from 'drizzle-kit'

const dbType = 'sqlite'

export default defineConfig({
  dialect: dbType,
  dbCredentials: {
    url: 'file:data/db.sqlite',
  },
  out: './src/database/migrations',
  schema: `./src/models/${dbType}`,
})
