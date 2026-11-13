import type { Channel } from '../db/schema.js'

interface InboundMessageBase {
  channel: Channel
  /**
   * Stable id of the sender on this channel. This is what channel links and
   * the transcript are keyed on. For WhatsApp it is the business-scoped user
   * id (BSUID), falling back to the phone number when no BSUID is present.
   */
  externalId: string
  /** Sender's phone number, when the channel provides one. */
  phoneNumber?: string
  /** The channel's own id for this message, used to drop duplicates. */
  messageId: string
  /** Sender's display name, if the channel shares it. */
  senderName?: string
  receivedAt: Date
}

/** A message the assistant can read. */
export interface InboundTextMessage extends InboundMessageBase {
  kind: 'text'
  text: string
}

/** A message type we don't handle yet (image, voice note, sticker, ...). */
export interface InboundUnsupportedMessage extends InboundMessageBase {
  kind: 'unsupported'
  /** The channel's name for the type, e.g. "image" or "audio". */
  type: string
}

/** One incoming message from any channel, in a channel-neutral shape. */
export type InboundMessage = InboundTextMessage | InboundUnsupportedMessage
