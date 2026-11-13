import { getAuth } from '@clerk/hono'
import { Hono, type Context } from 'hono'
import { csrf } from 'hono/csrf'
import { css, cx } from 'hono/css'
import type { FC } from 'hono/jsx'
import { z } from 'zod'
import { clerk, clerkBrowserConfig, requireSignedIn, signOut } from '../auth/clerk.js'
import { dispatchUserMessage } from '../agent/dispatch.js'
import { loadHistory, saveMessage } from '../channels/transcript.js'
import type { Message } from '../db/schema.js'
import { gateInbound, UPGRADE_MESSAGE, type GateResult } from '../gate/channel-gate.js'
import { CHAT_PAGE_SCRIPT } from './chat-script.js'
import { renderer } from './renderer.js'

/** Web pages, mounted at / in app.ts. */
export const web = new Hono()

// Scope the layout and Clerk to these paths only, so /health and the
// webhooks stay JSON and don't need Clerk keys.
web.use('/', renderer)
web.use('/chat', renderer, clerk, requireSignedIn)

/** Longest message a user can send, in characters. */
export const MAX_MESSAGE_LENGTH = 4000

/* ---------- styles ---------- */

const header = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 24px;
  h1 {
    margin: 0;
    font-size: 1.25rem;
  }
`

const muted = css`
  color: #6b7280;
  font-size: 0.9rem;
`

const button = css`
  font: inherit;
  padding: 6px 14px;
  border: 1px solid #d0d4da;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
`

const primaryButton = css`
  font: inherit;
  padding: 8px 18px;
  border: 0;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
  align-self: flex-end;
`

const thread = css`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 240px;
  padding: 16px;
  border: 1px solid #d0d4da;
  border-radius: 12px;
`

const empty = css`
  margin: auto;
  text-align: center;
`

const bubble = css`
  max-width: 85%;
  padding: 8px 12px;
  border-radius: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`

const fromUser = css`
  align-self: flex-end;
  background: #2563eb;
  color: #fff;
  border-bottom-right-radius: 4px;
`

const fromAssistant = css`
  align-self: flex-start;
  background: #e6e9ee;
  color: #1f2328;
  border-bottom-left-radius: 4px;
`

const composer = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
  textarea {
    font: inherit;
    width: 100%;
    min-height: 80px;
    padding: 10px 12px;
    border: 1px solid #d0d4da;
    border-radius: 10px;
    resize: vertical;
    background: transparent;
    color: inherit;
  }
`

const notice = css`
  margin-top: 16px;
  padding: 16px;
  border: 1px solid #f59e0b;
  border-radius: 12px;
  background: rgba(245, 158, 11, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  p {
    margin: 0;
  }
`

const linkButton = css`
  padding: 8px 18px;
  border-radius: 8px;
  background: #2563eb;
  color: #fff !important;
  text-decoration: none;
`

const errorText = css`
  color: #dc2626;
  font-size: 0.9rem;
  margin: 0;
`

/* ---------- components ---------- */

const Home: FC = () => (
  <>
    <h1>Personal AI Assistant</h1>
    <p>Your own AI assistant that can search the web and run code for you.</p>
    <p>
      <a href="/chat">Open chat →</a>
    </p>
  </>
)

const UpgradeNotice: FC<{ url: string }> = ({ url }) => (
  <div id="latest" class={notice}>
    <p>
      <strong>{UPGRADE_MESSAGE}</strong>
      <br />
      <span class={muted}>Subscribe, then come back here to chat. Your history is kept.</span>
    </p>
    <a class={linkButton} href={url}>
      Upgrade to Pro
    </a>
  </div>
)

/** Seconds between automatic page refreshes while a reply is on its way. */
const REFRESH_SECONDS = 2
/** Stop refreshing automatically after this long without a reply. */
const MAX_WAIT_MS = 2 * 60 * 1000

/**
 * While the newest message is the user's, the reply is still being written.
 * Show a placeholder; the page script reloads the page until it arrives.
 * The reload URL differs every time: reloading the same "/chat#latest" would
 * only scroll, not reload.
 */
const PendingReply: FC<{ history: Message[] }> = ({ history }) => {
  const last = history.at(-1)
  if (!last || last.role !== 'user') return null
  const waitedMs = Date.now() - last.createdAt.getTime()
  if (waitedMs > MAX_WAIT_MS) {
    return (
      <div class={cx(bubble, fromAssistant, muted)}>
        This is taking longer than usual. Refresh the page to check again.
      </div>
    )
  }
  return (
    <div
      class={cx(bubble, fromAssistant, muted)}
      aria-live="polite"
      data-refresh-url={`/chat?t=${Date.now()}#latest`}
      data-refresh-seconds={String(REFRESH_SECONDS)}
    >
      Thinking…
      <noscript> Refresh the page to see the reply.</noscript>
    </div>
  )
}

/** Clerk's browser script plus the page script (see chat-script.ts). */
const PageScripts: FC = () => {
  const { publishableKey, scriptUrl } = clerkBrowserConfig()
  return (
    <>
      <script
        defer
        crossorigin="anonymous"
        data-clerk-publishable-key={publishableKey}
        src={scriptUrl}
        type="text/javascript"
      />
      <script dangerouslySetInnerHTML={{ __html: CHAT_PAGE_SCRIPT }} />
    </>
  )
}

interface ChatPageProps {
  who: string
  history: Message[]
  gate: GateResult
  /** One-time id for the next form submit, so a double submit saves once. */
  clientMessageId: string
  error?: string
  /** Text to put back in the box after a validation error. */
  draft?: string
}

const ChatPage: FC<ChatPageProps> = ({ who, history, gate, clientMessageId, error, draft }) => (
  <>
    <div class={header}>
      <div>
        <h1>Chat</h1>
        <div class={muted}>Signed in as {who}</div>
      </div>
      <form method="post" action="/sign-out">
        <button class={button} type="submit">
          Sign out
        </button>
      </form>
    </div>

    <div class={thread}>
      {history.length === 0 ? (
        <p class={cx(muted, empty)}>No messages yet. Say hello below.</p>
      ) : (
        history.map((m) => (
          <div class={cx(bubble, m.role === 'user' ? fromUser : fromAssistant)}>{m.content}</div>
        ))
      )}
      <PendingReply history={history} />
    </div>

    {gate.status === 'upgrade_required' ? (
      <UpgradeNotice url={gate.upgradeUrl} />
    ) : (
      <form id="latest" class={composer} method="post" action="/chat">
        <input type="hidden" name="clientMessageId" value={clientMessageId} />
        <textarea
          name="text"
          placeholder="Type a message…"
          maxlength={MAX_MESSAGE_LENGTH}
          required
          aria-label="Message"
        >
          {draft ?? ''}
        </textarea>
        {error && <p class={errorText}>{error}</p>}
        <button class={primaryButton} type="submit">
          Send
        </button>
      </form>
    )}
    <PageScripts />
  </>
)

/* ---------- routes ---------- */

/** The signed-in user's id. requireSignedIn has already checked it exists. */
function currentUserId(c: Context): string {
  const { userId } = getAuth(c)
  if (!userId) throw new Error('requireSignedIn must run before this handler')
  return userId
}

/** Run the channel gate for the signed-in web user. */
function gateWebUser(c: Context, userId: string): Promise<GateResult> {
  const auth = getAuth(c)
  return gateInbound({
    clerk: c.get('clerk'),
    clerkUserId: userId,
    sessionHas: (params) => auth.has(params),
  })
}

async function renderChat(
  c: Context,
  userId: string,
  gate: GateResult,
  extra: { error?: string; draft?: string } = {},
) {
  const [user, history] = await Promise.all([
    c.get('clerk').users.getUser(userId),
    loadHistory('web', userId),
  ])
  const who = user.primaryEmailAddress?.emailAddress ?? user.username ?? 'your account'
  return c.render(
    <ChatPage
      who={who}
      history={history}
      gate={gate}
      clientMessageId={crypto.randomUUID()}
      {...extra}
    />,
    { title: 'Chat' },
  )
}

web.get('/', (c) => c.render(<Home />, { title: 'Home' }))

web.get('/chat', async (c) => {
  const userId = currentUserId(c)
  return renderChat(c, userId, await gateWebUser(c, userId))
})

const messageForm = z.object({
  clientMessageId: z.uuid('Something went wrong with the form. Please reload the page and try again.'),
  text: z
    .string()
    .trim()
    .min(1, 'Please type a message.')
    .max(MAX_MESSAGE_LENGTH, `Messages can be at most ${MAX_MESSAGE_LENGTH} characters.`),
})

// A plain form post; csrf() rejects posts from other websites.
web.post('/chat', csrf(), async (c) => {
  const userId = currentUserId(c)

  // Channel gate first: nothing is saved for users without Pro.
  const gate = await gateWebUser(c, userId)
  if (gate.status !== 'allowed') {
    c.status(403)
    return renderChat(c, userId, gate)
  }

  const body = await c.req.parseBody()
  const parsed = messageForm.safeParse(body)
  if (!parsed.success) {
    c.status(422)
    const draft = typeof body.text === 'string' ? body.text.slice(0, MAX_MESSAGE_LENGTH) : ''
    return renderChat(c, userId, gate, { error: parsed.error.issues[0]?.message, draft })
  }

  const { text, clientMessageId } = parsed.data
  const saved = await saveMessage({
    channel: 'web',
    externalId: userId,
    clerkUserId: userId,
    role: 'user',
    content: text,
    providerMessageId: `web:${clientMessageId}`,
  })

  // Only new messages go to the assistant; a re-submitted form already did.
  // The reply is written by a Trigger.dev task; the page waits for it.
  if (saved) await dispatchUserMessage(saved.id)

  // Post/Redirect/Get: refreshing the page won't send the message again.
  return c.redirect('/chat#latest', 303)
})

web.post('/sign-out', csrf(), clerk, async (c) => {
  await signOut(c)
  return c.redirect('/', 303)
})
