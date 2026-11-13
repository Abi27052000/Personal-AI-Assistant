import { createHash, randomUUID } from 'node:crypto'
import {
  Daytona,
  DaytonaConflictError,
  DaytonaNotFoundError,
  type CreateSandboxFromSnapshotParams,
  type Sandbox,
} from '@daytona/sdk'
import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { env, requireEnv } from '../config/env.js'

/*
 * Computer tools [computer-tools.ts]: each user gets their own isolated
 * Daytona sandbox (a small Linux computer in the cloud) where the assistant
 * can run commands and code and keep files. Nothing runs on our servers.
 *
 * No app secrets are ever passed into a sandbox.
 */

/** Seconds a single command or program may run. */
export const COMMAND_TIMEOUT_S = 60
/** Command output longer than this is cut (it goes back to the AI model). */
export const MAX_OUTPUT_CHARS = 8_000
/** Largest file the assistant may write. */
export const MAX_WRITE_BYTES = 100_000
/** File text longer than this is cut when read. */
export const MAX_READ_CHARS = 20_000

/** Sandbox lifecycle, in minutes. */
export const SANDBOX_LIFECYCLE = {
  /** Stop after 15 minutes idle: only disk is billed while stopped. */
  autoStopInterval: 15,
  /** Archive after 1 day stopped: nothing is billed while archived. */
  autoArchiveInterval: 24 * 60,
  /** Delete after 30 days stopped. */
  autoDeleteInterval: 30 * 24 * 60,
}

/** The part of the Daytona client the tools use (lets tests pass a fake). */
export interface SandboxProvider {
  get(nameOrId: string): Promise<Sandbox>
  create(params: CreateSandboxFromSnapshotParams, options?: { timeout?: number }): Promise<Sandbox>
}

let daytona: SandboxProvider | undefined
function defaultProvider(): SandboxProvider {
  if (!daytona) daytona = new Daytona({ apiKey: requireEnv('DAYTONA_API_KEY') })
  return daytona
}

/** Stable, non-reversible sandbox name for a user: same user, same computer. */
export function sandboxNameFor(userId: string): string {
  const hash = createHash('sha256').update(`personal-assistant:${userId}`).digest('hex')
  return `pa-${hash.slice(0, 24)}`
}

/**
 * The user's sandbox, started and ready. Creates it on first use. If two
 * messages race to create it, the loser reuses the winner's sandbox.
 */
export async function getUserSandbox(
  userId: string,
  provider: SandboxProvider = defaultProvider(),
): Promise<Sandbox> {
  const name = sandboxNameFor(userId)
  let sandbox: Sandbox
  try {
    sandbox = await provider.get(name)
  } catch (err) {
    if (!(err instanceof DaytonaNotFoundError)) throw err
    try {
      sandbox = await provider.create(
        {
          name,
          language: 'python',
          labels: { app: 'personal-assistant' },
          ...SANDBOX_LIFECYCLE,
        },
        { timeout: 120 },
      )
      console.log(`[computer] created sandbox ${name}`)
    } catch (createErr) {
      if (!(createErr instanceof DaytonaConflictError)) throw createErr
      sandbox = await provider.get(name)
    }
  }
  if (sandbox.state !== 'started') {
    // Stopped or archived: start it again (archived takes longer to restore).
    await sandbox.start(120)
  }
  return sandbox
}

function cut(text: string, max: number, what: string): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false }
  return { text: `${text.slice(0, max)}\n[…${what} shortened]`, truncated: true }
}

function describeError(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 300)
}

function logTool(name: string, detail: string): void {
  console.log(`[computer] ${name}${env.NODE_ENV === 'production' ? '' : `: ${detail.slice(0, 120)}`}`)
}

/** Shell-quote a single argument. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

const RUNNERS = {
  python: { ext: 'py', command: 'python3' },
  javascript: { ext: 'js', command: 'node' },
  typescript: { ext: 'ts', command: 'npx --yes tsx' },
} as const

/**
 * The computer tools for one user. The sandbox is only fetched (and created
 * or started) the first time a tool is actually used in this reply.
 */
export function computerTools(
  userId: string,
  provider: () => SandboxProvider = defaultProvider,
): ToolSet {
  let sandboxPromise: Promise<Sandbox> | undefined
  const sandbox = () => {
    sandboxPromise ??= getUserSandbox(userId, provider()).catch((err) => {
      sandboxPromise = undefined // let the next tool call try again
      throw err
    })
    return sandboxPromise
  }

  const run = async (command: string) => {
    const sb = await sandbox()
    const res = await sb.process.executeCommand(`${command} 2>&1`, undefined, undefined, COMMAND_TIMEOUT_S)
    const output = cut(res.result ?? '', MAX_OUTPUT_CHARS, 'output')
    return { exitCode: res.exitCode, output: output.text, truncated: output.truncated }
  }

  return {
    runCommand: tool({
      description:
        "Run a shell command on the user's own Linux computer in the cloud (an isolated sandbox " +
        'with Python 3 and Node.js). Use it for calculations, data processing, file handling or ' +
        `installing packages (pip, npm). Times out after ${COMMAND_TIMEOUT_S} seconds. Files persist ` +
        'between messages in the current directory.',
      inputSchema: z.object({
        command: z.string().trim().min(1).max(4_000).describe('The shell command to run'),
      }),
      execute: async ({ command }) => {
        logTool('runCommand', command)
        try {
          return await run(command)
        } catch (err) {
          console.warn(`[computer] runCommand failed: ${describeError(err)}`)
          return { error: `Could not run the command: ${describeError(err)}` }
        }
      },
    }),

    runCode: tool({
      description:
        "Run a program on the user's cloud computer and return its output. Prefer Python for " +
        `calculations and data work. Print the results you need. Times out after ${COMMAND_TIMEOUT_S} seconds.`,
      inputSchema: z.object({
        language: z.enum(['python', 'javascript', 'typescript']),
        code: z.string().min(1).max(50_000).describe('The full program to run'),
      }),
      execute: async ({ language, code }) => {
        logTool('runCode', `${language}, ${code.length} chars`)
        try {
          const runner = RUNNERS[language]
          const sb = await sandbox()
          const file = `/tmp/pa-run-${randomUUID()}.${runner.ext}`
          await sb.fs.uploadFile(Buffer.from(code, 'utf8'), file)
          const result = await run(`${runner.command} ${shellQuote(file)}`)
          await sb.process.executeCommand(`rm -f ${shellQuote(file)}`).catch(() => {})
          return result
        } catch (err) {
          console.warn(`[computer] runCode failed: ${describeError(err)}`)
          return { error: `Could not run the code: ${describeError(err)}` }
        }
      },
    }),

    writeFile: tool({
      description:
        "Save a text file on the user's cloud computer (overwrites an existing file). Relative " +
        'paths are inside the working directory, where files persist between messages.',
      inputSchema: z.object({
        path: z.string().trim().min(1).max(500),
        content: z.string().max(MAX_WRITE_BYTES),
      }),
      execute: async ({ path, content }) => {
        logTool('writeFile', path)
        const bytes = Buffer.from(content, 'utf8')
        if (bytes.length > MAX_WRITE_BYTES) {
          return { error: `File too large (${bytes.length} bytes). The limit is ${MAX_WRITE_BYTES} bytes.` }
        }
        try {
          const sb = await sandbox()
          await sb.fs.uploadFile(bytes, path)
          return { saved: path, bytes: bytes.length }
        } catch (err) {
          console.warn(`[computer] writeFile failed: ${describeError(err)}`)
          return { error: `Could not save the file: ${describeError(err)}` }
        }
      },
    }),

    readFile: tool({
      description: "Read a text file from the user's cloud computer.",
      inputSchema: z.object({ path: z.string().trim().min(1).max(500) }),
      execute: async ({ path }) => {
        logTool('readFile', path)
        try {
          const sb = await sandbox()
          const data = await sb.fs.downloadFile(path)
          const content = cut(data.toString('utf8'), MAX_READ_CHARS, 'file')
          return { path, content: content.text, truncated: content.truncated }
        } catch (err) {
          console.warn(`[computer] readFile failed: ${describeError(err)}`)
          return { error: `Could not read the file: ${describeError(err)}` }
        }
      },
    }),
  }
}
