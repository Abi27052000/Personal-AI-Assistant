import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { env, requireEnv } from '../config/env.js'
import {
  extractWhatsAppMessages,
  safeEqual,
  verifyWhatsAppSignature,
} from '../channels/whatsapp-inbound.js'
import type { InboundMessage } from '../channels/types.js'

/** Mounted at /webhooks/whatsapp in app.ts. */
export const whatsappWebhook = new Hono()

/**
 * Meta's one-time setup check, sent when you click "Verify and save" in the
 * App Dashboard. Echo hub.challenge only if the verify token matches ours.
 */
whatsappWebhook.get('/', (c) => {
  const mode = c.req.query('hub.mode')
  const token = c.req.query('hub.verify_token')
  const challenge = c.req.query('hub.challenge')
  const expected = requireEnv('WHATSAPP_VERIFY_TOKEN')

  if (mode === 'subscribe' && token && challenge && safeEqual(token, expected)) {
    return c.text(challenge, 200)
  }
  return c.json({ error: 'Forbidden' }, 403)
})

/**
 * Incoming messages and delivery receipts. Only requests signed with our app
 * secret are accepted. Once the signature checks out we always answer 200,
 * because Meta keeps retrying anything else.
 */
whatsappWebhook.post('/', bodyLimit({ maxSize: 1024 * 1024 }), async (c) => {
  const appSecret = requireEnv('WHATSAPP_APP_SECRET')
  // Sign-check the exact bytes Meta sent, before any parsing.
  const rawBody = new Uint8Array(await c.req.arrayBuffer())
  if (!verifyWhatsAppSignature(rawBody, c.req.header('x-hub-signature-256'), appSecret)) {
    return c.json({ error: 'Invalid signature' }, 401)
  }

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody))
  } catch {
    console.warn('[whatsapp] signed webhook body is not valid JSON; ignored')
    return c.json({ ok: true })
  }

  const result = extractWhatsAppMessages(payload)
  if (!result.recognized) {
    console.warn('[whatsapp] unrecognised webhook payload; ignored')
    return c.json({ ok: true })
  }

  for (const message of result.messages) {
    logInbound(message)
  }
  if (result.skippedCount > 0) {
    console.warn(`[whatsapp] skipped ${result.skippedCount} unreadable message(s)`)
  }
  // Steps 4-7 replace the logging above with replies, the gate and Trigger.dev.
  return c.json({ ok: true })
})

/** Show only the last 4 characters of a sender id in logs. */
function maskId(id: string): string {
  return id.length <= 4 ? '****' : `***${id.slice(-4)}`
}

function logInbound(message: InboundMessage): void {
  const who = maskId(message.externalId)
  if (message.kind === 'text') {
    // Message text only in development logs, never in production.
    const preview =
      env.NODE_ENV === 'production'
        ? `${message.text.length} chars`
        : JSON.stringify(message.text.slice(0, 200))
    console.log(`[whatsapp] text from ${who}: ${preview}`)
  } else {
    console.log(`[whatsapp] unsupported "${message.type}" message from ${who}`)
  }
}
