import { getAuth } from '@clerk/hono'
import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { css } from 'hono/css'
import type { FC } from 'hono/jsx'
import { clerk, requireSignedIn, signOut } from '../auth/clerk.js'
import { renderer } from './renderer.js'

/** Web pages, mounted at / in app.ts. */
export const web = new Hono()

// Scope the layout and Clerk to these paths only, so /health and the
// webhooks stay JSON and don't need Clerk keys.
web.use('/', renderer)
web.use('/chat', renderer, clerk, requireSignedIn)

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

const chatBox = css`
  min-height: 320px;
  padding: 16px;
  border: 1px solid #d0d4da;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
`

const Home: FC = () => (
  <>
    <h1>Personal AI Assistant</h1>
    <p>Your own AI assistant that can search the web and run code for you.</p>
    <p>
      <a href="/chat">Open chat →</a>
    </p>
  </>
)

const ChatPage: FC<{ who: string }> = ({ who }) => (
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
    <div class={chatBox}>
      <p class={muted}>No messages yet. Chatting arrives in the next step.</p>
    </div>
  </>
)

web.get('/', (c) => c.render(<Home />, { title: 'Home' }))

web.get('/chat', async (c) => {
  const { userId } = getAuth(c)
  // requireSignedIn guarantees a user here.
  const user = await c.get('clerk').users.getUser(userId!)
  const who = user.primaryEmailAddress?.emailAddress ?? user.username ?? 'your account'
  return c.render(<ChatPage who={who} />, { title: 'Chat' })
})

// A plain form post; csrf() rejects posts from other websites.
web.post('/sign-out', csrf(), clerk, async (c) => {
  await signOut(c)
  return c.redirect('/', 303)
})
