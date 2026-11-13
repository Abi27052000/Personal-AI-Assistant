import type { Message } from '../db/schema.js'

/**
 * Create the assistant's reply to a conversation. `history` is oldest first
 * and ends with the user's newest message.
 *
 * Echo for now. Step 8 replaces this body with the AI agent; nothing else
 * has to change.
 */
export async function createReply(history: Message[]): Promise<string> {
  const latest = history.at(-1)
  if (!latest || latest.role !== 'user') {
    throw new Error('createReply needs a conversation that ends with a user message')
  }
  return `You said: ${latest.content}`
}
