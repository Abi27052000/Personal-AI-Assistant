import { logger, schemaTask } from '@trigger.dev/sdk'
import { z } from 'zod'
import { handleUserMessage, sendFailureReply } from '../agent/handle-message.js'

/**
 * Writes the assistant's reply to one chat message. Triggered by the web app
 * after it saves the user's message (src/agent/dispatch.ts).
 *
 * Retries follow trigger.config.ts. Retrying is safe: a message gets at most
 * one reply. If every attempt fails, the user gets the failure reply instead.
 */
export const webChatMessage = schemaTask({
  id: 'web-chat-message',
  schema: z.object({ messageId: z.uuid() }),
  // Generous for AI replies with tool calls (Steps 8-10).
  maxDuration: 300,
  run: async ({ messageId }) => {
    const result = await handleUserMessage(messageId)
    logger.info('web chat message handled', { messageId, ...result })
    return result
  },
  onFailure: async ({ payload, error }) => {
    logger.error('web chat message failed after all retries', {
      messageId: payload.messageId,
      error: String(error),
    })
    await sendFailureReply(payload.messageId)
  },
})
