import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  dbCredentials: {
    url: 'file:data/db.sqlite',
  },
  out: './src/database/migrations',
  schema: './src/database/schema',
})
