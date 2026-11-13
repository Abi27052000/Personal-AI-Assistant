import { sendToChannel } from '../channels/channel-senders.js'
import { getMessage } from '../channels/transcript.js'

/*
 * The apology sent when a message can't be answered. Kept apart from the AI
 * agent so the web server can use it without loading any AI or web-tool code.
 */

export const FAILURE_REPLY = 'Sorry, something went wrong. Please try again.'

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
