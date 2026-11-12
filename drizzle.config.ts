import { defineConfig } from 'drizzle-kit'

// drizzle-kit doesn't read .env on its own. Load it if present; in CI or on
// Railway the variables come from the environment instead.
try {
  process.loadEnvFile()
} catch {
  // No .env file: rely on variables already set in the environment.
}

// Migrations run best over Neon's direct (unpooled) connection; fall back to
// the pooled one if only that is set. Commands that don't touch the database
// (db:generate) work with neither.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || ''

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url },
  strict: true,
  verbose: true,
})
