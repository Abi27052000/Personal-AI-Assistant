import { sendToChannel } from '../channels/channel-senders.js'
import { getMessage, loadHistory } from '../channels/transcript.js'
import { createReply } from './reply.js'

/*
 * What the background task does with one incoming message. Kept free of
 * Trigger.dev imports so it can be tested and reused on its own.
 */

export const FAILURE_REPLY = 'Sorry, something went wrong. Please try again.'

export type HandleResult =
  | { status: 'replied'; replyLength: number }
  | { status: 'skipped'; reason: string }

/** Create and deliver the reply to one saved user message. */
export async function handleUserMessage(messageId: string): Promise<HandleResult> {
  const message = await getMessage(messageId)
  if (!message) return { status: 'skipped', reason: 'message not found' }
  if (message.role !== 'user') return { status: 'skipped', reason: 'not a user message' }

  const history = await loadHistory(message.channel, message.externalId)
  // Answer this message, even if newer ones arrived since it was sent.
  const upTo = history.findIndex((m) => m.id === message.id)
  const conversation = upTo === -1 ? [...history, message] : history.slice(0, upTo + 1)

  const text = await createReply(conversation)
  await sendToChannel({
    channel: message.channel,
    externalId: message.externalId,
    clerkUserId: message.clerkUserId,
    text,
    replyToMessageId: message.id,
  })
  return { status: 'replied', replyLength: text.length }
}

/**
 * Tell the user their message couldn't be answered. Safe to call more than
 * once, and does nothing if a real reply was already delivered.
 */
export async function sendFailureReply(messageId: string): Promise<void> {
  const message = await getMessage(messageId)
  if (!message) return
  await sendToChannel({
    channel: message.channel,
    externalId: message.externalId,
    clerkUserId: message.clerkUserId,
    text: FAILURE_REPLY,
    replyToMessageId: message.id,
  })
}
