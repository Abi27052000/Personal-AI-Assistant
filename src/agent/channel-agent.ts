import type { ModelMessage, ToolSet } from 'ai'
import type { Message } from '../db/schema.js'
import { generateWithFallback, type GenerateResult, type ModelCandidate } from './model.js'

/*
 * Shared AI agent [channel-agent.ts]: the assistant itself. Every channel
 * (web today, chat apps later) hands it the conversation and gets a reply.
 */

/** How many recent messages the assistant sees. */
export const MAX_HISTORY_MESSAGES = 30
/** Longer messages are cut to this many characters, to keep costs predictable. */
export const MAX_MESSAGE_CHARS = 8_000

export function buildInstructions(now: Date = new Date()): string {
  const today = now.toISOString().slice(0, 10)
  return [
    'You are a helpful personal AI assistant, chatting with one person through a chat app.',
    `Today's date is ${today} (UTC).`,
    'Be friendly, clear and concise. Prefer short answers unless the user asks for detail.',
    'Use plain text: the chat does not render Markdown, so avoid headings, tables and **bold**.',
    "If you don't know something or can't do it, say so honestly instead of guessing.",
  ].join('\n')
}

/**
 * Turn the transcript into model messages: the latest messages only, long
 * ones trimmed, starting with a user message, and consecutive messages from
 * the same side merged (some providers require alternating turns).
 */
export function toModelMessages(history: Message[]): ModelMessage[] {
  const recent = history.slice(-MAX_HISTORY_MESSAGES)
  const firstUser = recent.findIndex((m) => m.role === 'user')
  if (firstUser === -1) return []

  const merged: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of recent.slice(firstUser)) {
    const content =
      m.content.length > MAX_MESSAGE_CHARS
        ? `${m.content.slice(0, MAX_MESSAGE_CHARS)}\n[…message shortened]`
        : m.content
    const last = merged.at(-1)
    if (last && last.role === m.role) last.content += `\n\n${content}`
    else merged.push({ role: m.role, content })
  }
  return merged
}

/** Tools the assistant can use. Filled in by Step 9 (web) and Step 10 (computer). */
export function agentTools(): ToolSet {
  return {}
}

export interface RunAgentInput {
  /** Oldest first, ending with the user message to answer. */
  history: Message[]
  /** Override the models (tests). */
  models?: ModelCandidate[]
}

export async function runAgent({ history, models }: RunAgentInput): Promise<GenerateResult> {
  const messages = toModelMessages(history)
  if (messages.at(-1)?.role !== 'user') {
    throw new Error('runAgent needs a conversation that ends with a user message')
  }
  return generateWithFallback(
    { instructions: buildInstructions(), messages, tools: agentTools() },
    models,
  )
}
