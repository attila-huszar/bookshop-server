import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dbCredentials: {
    url: 'file:./src/db/bookshop.db',
  },
  dialect: 'sqlite',
  out: './src/db/migrations',
  schema: './src/db/schema',
})
