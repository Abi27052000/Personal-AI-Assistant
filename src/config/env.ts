import { z } from 'zod'

/**
 * Base settings every part of the app needs. Defaults keep the app loadable
 * with no .env (e.g. by the Hono CLI), so only add fields here that are safe
 * to default. Feature secrets go through requireEnv() instead.
 */
const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  // AI models (Step 8). Model ids from the provider docs; change in .env.
  OPENAI_MODEL: z.string().trim().min(1).default('gpt-6.1-terra'),
  GEMINI_MODEL: z.string().trim().min(1).default('gemini-4-hydrogen'),
  // The assistant's idea of "today" and "now". An IANA name, e.g. Asia/Colombo.
  ASSISTANT_TIMEZONE: z
    .string()
    .trim()
    .default('UTC')
    .refine(isValidTimeZone, { message: 'Must be an IANA time zone name, e.g. Asia/Colombo' }),
})

function isValidTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: name })
    return true
  } catch {
    return false
  }
}

export type BaseEnv = z.infer<typeof baseSchema>

const parsed = baseSchema.safeParse(process.env)

if (!parsed.success) {
  throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`)
}

export const env: BaseEnv = parsed.data

/**
 * Read a secret or setting that a specific feature needs (e.g. the WhatsApp
 * token). Call it where the feature runs, not at import time, so the app can
 * still load without it. Throws a clear error if it is missing or empty.
 */
export function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name} (see .env.example)`)
  }
  return value
}
