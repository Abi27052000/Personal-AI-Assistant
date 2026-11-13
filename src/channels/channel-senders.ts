import type { Channel } from '../db/schema.js'
import { saveMessage } from './transcript.js'

export interface OutboundMessage {
  channel: Channel
  externalId: string
  clerkUserId: string
  text: string
}

/**
 * Deliver an assistant reply on the user's channel. The rest of the app calls
 * this and never needs to know how a channel delivers messages.
 */
export async function sendToChannel(message: OutboundMessage): Promise<void> {
  switch (message.channel) {
    case 'web':
      // The web chat page reads the transcript, so saving the reply delivers it.
      await saveMessage({
        channel: 'web',
        externalId: message.externalId,
        clerkUserId: message.clerkUserId,
        role: 'assistant',
        content: message.text,
      })
      return
    case 'whatsapp':
      // Sending needs Meta business verification (error 131031), so it isn't
      // built yet. Receiving works: see src/webhooks/whatsapp-webhook.ts.
      throw new Error('Sending on WhatsApp is not available yet')
  }
}
