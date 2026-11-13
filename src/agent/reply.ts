import type { Message } from '../db/schema.js'
import { runAgent } from './channel-agent.js'
import type { GenerateResult } from './model.js'

/**
 * Create the assistant's reply to a conversation. `history` is oldest first
 * and ends with the user's newest message.
 */
export async function createReply(history: Message[]): Promise<GenerateResult> {
  const latest = history.at(-1)
  if (!latest || latest.role !== 'user') {
    throw new Error('createReply needs a conversation that ends with a user message')
  }
  return runAgent({ userId: latest.clerkUserId, history })
}
