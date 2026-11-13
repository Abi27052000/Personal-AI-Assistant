import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { web } from './web/pages.js'
import { whatsappWebhook } from './webhooks/whatsapp-webhook.js'

const app = new Hono()

app.use(logger())

// Web pages: home, /chat (Clerk sign-in required) and sign-out.
app.route('/', web)

// Used by Railway (and anyone else) to check the server is up.
app.get('/health', (c) => {
  return c.json({ ok: true })
})

// Meta WhatsApp Cloud API: setup check (GET) and incoming messages (POST).
app.route('/webhooks/whatsapp', whatsappWebhook)

app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404)
})

app.onError((err, c) => {
  // Deliberate HTTP errors (e.g. 401, 403) keep their status and message.
  if (err instanceof HTTPException) {
    return c.json({ error: err.message || 'Error' }, err.status)
  }
  // Anything else is a bug: log the details, but don't leak them to the caller.
  console.error(err)
  return c.json({ error: 'Internal Server Error' }, 500)
})

export default app
