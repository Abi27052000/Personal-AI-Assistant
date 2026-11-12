import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { requireEnv } from '../config/env.js'
import * as schema from './schema.js'

export type Db = PostgresJsDatabase<typeof schema>

let db: Db | undefined

/**
 * The shared database client. Created on first use rather than at import
 * time, so the app (and the Hono CLI) can load without DATABASE_URL.
 */
export function getDb(): Db {
  if (!db) {
    const client = postgres(requireEnv('DATABASE_URL'), {
      // Neon's pooled connection (PgBouncer, transaction mode) does not
      // support prepared statements.
      prepare: false,
    })
    db = drizzle({ client, schema })
  }
  return db
}

export { schema }
