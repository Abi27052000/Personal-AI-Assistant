import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import {
  generateText,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
  type StopCondition,
  type TimeoutConfiguration,
  type ToolSet,
} from 'ai'
import { env, requireEnv } from '../config/env.js'

/*
 * Model adapter [model.ts]: one place that talks to AI providers.
 * OpenAI answers first; if it fails, the same request goes to Gemini.
 */

export interface ModelCandidate {
  /** Shown in logs, e.g. "openai:gpt-6.1-terra". */
  name: string
  /** Built lazily, so a missing API key only fails that one candidate. */
  create: () => LanguageModel
}

/** The providers to try, in order. */
export function defaultModels(): ModelCandidate[] {
  return [
    {
      name: `openai:${env.OPENAI_MODEL}`,
      create: () => createOpenAI({ apiKey: requireEnv('OPENAI_API_KEY') })(env.OPENAI_MODEL),
    },
    {
      name: `google:${env.GEMINI_MODEL}`,
      create: () =>
        createGoogleGenerativeAI({ apiKey: requireEnv('GOOGLE_GENERATIVE_AI_API_KEY') })(
          env.GEMINI_MODEL,
        ),
    },
  ]
}

export interface GenerateRequest {
  instructions: string
  messages: ModelMessage[]
  tools?: ToolSet
  /** When to stop a tool-calling loop (Steps 9-10). */
  stopWhen?: StopCondition<ToolSet>
  /** Time limits per provider attempt. Defaults: DEFAULT_TIMEOUT. */
  timeout?: TimeoutConfiguration<ToolSet>
}

/**
 * Default time limits for one provider attempt: each model call 45 s, each
 * tool call 25 s, and the whole attempt (with tool calls) 2 minutes.
 */
export const DEFAULT_TIMEOUT = { totalMs: 120_000, stepMs: 45_000, toolMs: 25_000 }

export interface GenerateResult {
  text: string
  /** Which candidate answered. */
  model: string
  /** True if an earlier candidate failed first. */
  fellBack: boolean
  usage: LanguageModelUsage
}

/** Thrown when every provider failed. Lists each provider's error. */
export class AllModelsFailedError extends Error {
  constructor(readonly failures: { model: string; error: unknown }[]) {
    super(
      `All AI models failed: ${failures.map((f) => `${f.model}: ${errorMessage(f.error)}`).join(' | ')}`,
    )
    this.name = 'AllModelsFailedError'
  }
}

/**
 * Generate a reply, trying each model in turn until one succeeds.
 * An empty reply counts as a failure, so the next model gets a chance.
 */
export async function generateWithFallback(
  request: GenerateRequest,
  models: ModelCandidate[] = defaultModels(),
): Promise<GenerateResult> {
  const failures: { model: string; error: unknown }[] = []

  for (const candidate of models) {
    try {
      const result = await generateText({
        model: candidate.create(),
        instructions: request.instructions,
        messages: request.messages,
        tools: request.tools,
        stopWhen: request.stopWhen,
        // One quick retry inside a provider; after that, move on to the next.
        maxRetries: 1,
        timeout: request.timeout ?? DEFAULT_TIMEOUT,
      })
      const text = result.text.trim()
      if (!text) throw new Error('model returned an empty reply')

      if (failures.length > 0) {
        console.warn(`[model] answered by ${candidate.name} after fallback`)
      }
      return { text, model: candidate.name, fellBack: failures.length > 0, usage: result.usage }
    } catch (error) {
      console.warn(`[model] ${candidate.name} failed: ${errorMessage(error)}`)
      failures.push({ model: candidate.name, error })
    }
  }

  throw new AllModelsFailedError(failures)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
