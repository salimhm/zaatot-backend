/// <reference types="bun-types" />
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/main.schema.db.ts',
  out: './.drizzle',
  dialect: 'turso',
  dbCredentials: {
    url: process.env.TURSO_DB_MAIN_URL!,
    authToken: process.env.TURSO_DB_MAIN_TOKEN!,
  },
})
