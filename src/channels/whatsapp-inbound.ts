import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { InboundMessage } from './types.js'

/*
 * Meta WhatsApp Cloud API webhooks.
 * Docs: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint/
 *       https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/text
 *
 * The schemas only describe the fields we use; anything else Meta sends is
 * ignored. Each message is validated on its own, so one odd message doesn't
 * hide the others in the same delivery.
 */

const contactSchema = z.object({
  profile: z.object({ name: z.string().optional() }).optional(),
  /** Phone-number based id. Omitted for users with a username and no visible number. */
  wa_id: z.string().optional(),
  /** Business-scoped user id (BSUID). Meta's recommended user identifier. */
  user_id: z.string().optional(),
})

const messageSchema = z.object({
  /** Sender's phone number. Omitted for users with a username and no visible number. */
  from: z.string().optional(),
  /** Sender's BSUID. */
  from_user_id: z.string().optional(),
  id: z.string().min(1),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
})

const payloadSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            contacts: z.array(contactSchema).optional(),
            messages: z.array(z.unknown()).optional(),
            statuses: z.array(z.unknown()).optional(),
          }),
        }),
      ),
    }),
  ),
})

export interface WhatsAppWebhookResult {
  /** False if the payload isn't a WhatsApp webhook shape we recognise. */
  recognized: boolean
  messages: InboundMessage[]
  /** Delivery/read receipts for messages we sent. Counted, not processed. */
  statusCount: number
  /** Message entries we couldn't read (bad shape or no sender id). */
  skippedCount: number
}

/** Turn a WhatsApp webhook payload into channel-neutral inbound messages. */
export function extractWhatsAppMessages(payload: unknown): WhatsAppWebhookResult {
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) {
    return { recognized: false, messages: [], statusCount: 0, skippedCount: 0 }
  }

  const messages: InboundMessage[] = []
  let statusCount = 0
  let skippedCount = 0

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue
      const { contacts = [], messages: rawMessages = [], statuses = [] } = change.value
      statusCount += statuses.length

      for (const raw of rawMessages) {
        const m = messageSchema.safeParse(raw)
        const externalId = m.success ? (m.data.from_user_id ?? m.data.from) : undefined
        if (!m.success || !externalId) {
          skippedCount++
          continue
        }
        const msg = m.data
        const contact = contacts.find(
          (c) =>
            (msg.from_user_id !== undefined && c.user_id === msg.from_user_id) ||
            (msg.from !== undefined && c.wa_id === msg.from),
        )
        const seconds = Number(msg.timestamp)
        const base = {
          channel: 'whatsapp' as const,
          externalId,
          phoneNumber: msg.from,
          messageId: msg.id,
          senderName: contact?.profile?.name,
          receivedAt: Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date(),
        }
        messages.push(
          msg.type === 'text' && msg.text
            ? { ...base, kind: 'text', text: msg.text.body }
            : { ...base, kind: 'unsupported', type: msg.type },
        )
      }
    }
  }

  return { recognized: true, messages, statusCount, skippedCount }
}

/**
 * Check Meta's X-Hub-Signature-256 header: "sha256=" + hex HMAC-SHA256 of the
 * raw request body, keyed with the app secret. Constant-time comparison.
 */
export function verifyWhatsAppSignature(
  rawBody: Uint8Array,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!header?.startsWith('sha256=')) return false
  const received = Buffer.from(header.slice('sha256='.length), 'hex')
  const expected = createHmac('sha256', appSecret).update(rawBody).digest()
  return received.length === expected.length && timingSafeEqual(received, expected)
}

/** Constant-time string comparison (hashing first makes the lengths equal). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}
