import { idempotencyKeys, tasks } from '@trigger.dev/sdk'
// Type-only import: the task code itself is never bundled into the web server.
import type { webChatMessage } from '../trigger/web-chat.js'
import { sendFailureReply } from './failure-reply.js'

/**
 * Hand a saved user message to the Trigger.dev task that writes the reply.
 * Returns straight away; the reply arrives in the transcript later.
 *
 * If Trigger.dev can't be reached, the user gets the failure reply instead
 * of waiting forever.
 */
export async function dispatchUserMessage(messageId: string): Promise<void> {
  try {
    // Global scope: this message is processed once, however often it's dispatched.
    const idempotencyKey = await idempotencyKeys.create(`chat-message:${messageId}`, {
      scope: 'global',
    })
    await tasks.trigger<typeof webChatMessage>('web-chat-message', { messageId }, { idempotencyKey })
  } catch (err) {
    console.error('[dispatch] could not trigger web-chat-message for', messageId, err)
    await sendFailureReply(messageId)
  }
}
