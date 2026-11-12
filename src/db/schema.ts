import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

/**
 * Chat apps we can receive messages from. Stored as plain text so adding a
 * channel later needs no database migration, only a new value here.
 */
export type Channel = 'whatsapp'

/** Who wrote a transcript message. */
export type MessageRole = 'user' | 'assistant'

/**
 * Links a chat account (e.g. a WhatsApp number) to a Clerk user.
 * Each chat account can be linked to exactly one Clerk user.
 */
export const channelLinks = pgTable(
  'channel_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channel: text('channel').$type<Channel>().notNull(),
    /** The sender's id on that channel, e.g. the WhatsApp number (wa_id). */
    externalId: text('external_id').notNull(),
    clerkUserId: text('clerk_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('channel_links_channel_external_id_uq').on(t.channel, t.externalId),
    index('channel_links_clerk_user_id_idx').on(t.clerkUserId),
  ],
)

/**
 * One-time tokens sent to unlinked senders. Opening /link?token=... while
 * signed in to Clerk turns the token into a channel link.
 */
export const linkTokens = pgTable('link_tokens', {
  token: text('token').primaryKey(),
  channel: text('channel').$type<Channel>().notNull(),
  externalId: text('external_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  /** Set when the token is used, so it can't be used twice. */
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Conversation transcript, one row per message in either direction.
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channel: text('channel').$type<Channel>().notNull(),
    externalId: text('external_id').notNull(),
    clerkUserId: text('clerk_user_id').notNull(),
    role: text('role').$type<MessageRole>().notNull(),
    content: text('content').notNull(),
    /**
     * The channel's own message id (e.g. WhatsApp's wamid). Unique, so a
     * message the channel delivers twice is only stored once. Postgres allows
     * many NULLs in a unique column, so messages without an id still insert.
     */
    providerMessageId: text('provider_message_id').unique('messages_provider_message_id_uq'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Loading the latest messages of one conversation.
    index('messages_conversation_idx').on(t.channel, t.externalId, t.createdAt),
  ],
)

export type ChannelLink = typeof channelLinks.$inferSelect
export type LinkToken = typeof linkTokens.$inferSelect
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
