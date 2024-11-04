import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  dbCredentials: {
    url: 'file:./db.sqlite',
  },
  out: './src/db/migrations',
  schema: './src/db/schema',
})
