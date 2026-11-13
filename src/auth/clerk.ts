import { createRedirect } from '@clerk/backend/internal'
import { parsePublishableKey } from '@clerk/shared/keys'
import { clerkMiddleware, getAuth } from '@clerk/hono'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie } from 'hono/cookie'
import { requireEnv } from '../config/env.js'

/*
 * Clerk authentication for the web pages.
 * Sign-in happens on Clerk's hosted Account Portal, so the app needs no
 * sign-in UI or browser JavaScript of its own.
 *
 * clerkMiddleware() reads CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY from the
 * environment. Apply it only to routes that need it, so /health and the
 * webhooks keep working without Clerk keys.
 */
export const clerk: MiddlewareHandler = clerkMiddleware()

/** Clerk's development "dev browser" cookie, possibly with a per-app suffix. */
function devBrowserToken(c: Context): string | undefined {
  const cookies = getCookie(c)
  if (cookies.__clerk_db_jwt) return cookies.__clerk_db_jwt
  const suffixed = Object.keys(cookies).find((name) => name.startsWith('__clerk_db_jwt_'))
  return suffixed ? cookies[suffixed] : undefined
}

/**
 * Lets signed-in users through; sends everyone else to Clerk's hosted
 * sign-in page, which brings them back to the page they asked for.
 * Use after `clerk`.
 */
export const requireSignedIn: MiddlewareHandler = async (c, next) => {
  const { userId } = getAuth(c)
  if (userId) {
    await next()
    return
  }
  const { redirectToSignIn } = createRedirect<Response>({
    publishableKey: requireEnv('CLERK_PUBLISHABLE_KEY'),
    devBrowserToken: devBrowserToken(c),
    baseUrl: new URL(c.req.url).origin,
    redirectAdapter: (url) => c.redirect(String(url)),
  })
  return redirectToSignIn({ returnBackUrl: c.req.url })
}

/**
 * What a page needs to load Clerk's browser script (clerk-js). The script
 * keeps the short-lived session cookie renewed in the background, so a form
 * posted after a pause is still signed in. Both values are public.
 */
export function clerkBrowserConfig(): { publishableKey: string; scriptUrl: string } {
  const publishableKey = requireEnv('CLERK_PUBLISHABLE_KEY')
  const parsed = parsePublishableKey(publishableKey)
  if (!parsed) throw new Error('CLERK_PUBLISHABLE_KEY is not a valid Clerk publishable key')
  return {
    publishableKey,
    scriptUrl: `https://${parsed.frontendApi}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`,
  }
}

/**
 * Sign the current user out: end the session at Clerk, then drop the
 * session cookie so this browser is signed out straight away (instead of
 * when the short-lived session token expires). Use after `clerk`.
 */
export async function signOut(c: Context): Promise<void> {
  const { sessionId } = getAuth(c)
  if (sessionId) {
    try {
      await c.get('clerk').sessions.revokeSession(sessionId)
    } catch (err) {
      // Still clear the cookies below; the user asked to be signed out.
      console.error('[auth] could not revoke Clerk session', err)
    }
  }
  for (const name of Object.keys(getCookie(c))) {
    if (name === '__session' || name.startsWith('__session_')) {
      deleteCookie(c, name, { path: '/' })
    }
  }
}
