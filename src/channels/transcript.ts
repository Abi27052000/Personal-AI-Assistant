import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '../db/index.js'
import { messages, type Channel, type Message, type MessageRole } from '../db/schema.js'

/*
 * Transcript: every message in a conversation, in both directions.
 * A conversation is identified by (channel, externalId). For the web channel
 * the externalId is the Clerk user id.
 */

export interface SaveMessageInput {
  channel: Channel
  externalId: string
  clerkUserId: string
  role: MessageRole
  content: string
  /**
   * The channel's own id for this message. Unique: saving the same id twice
   * stores it once, which drops duplicate deliveries and double submits.
   */
  providerMessageId?: string
}

/**
 * Save one message. Returns the saved row, or null if a message with the
 * same providerMessageId already exists (a duplicate).
 */
export async function saveMessage(input: SaveMessageInput): Promise<Message | null> {
  const [row] = await getDb()
    .insert(messages)
    .values(input)
    .onConflictDoNothing({ target: messages.providerMessageId })
    .returning()
  return row ?? null
}

/** The latest `limit` messages of one conversation, oldest first. */
export async function loadHistory(
  channel: Channel,
  externalId: string,
  limit = 50,
): Promise<Message[]> {
  const rows = await getDb()
    .select()
    .from(messages)
    .where(and(eq(messages.channel, channel), eq(messages.externalId, externalId)))
    .orderBy(desc(messages.createdAt))
    .limit(limit)
  return rows.reverse()
}
