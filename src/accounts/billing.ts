import type { ClerkClient } from '@clerk/backend'
import { buildAccountsBaseUrl } from '@clerk/shared/buildAccountsBaseUrl'
import { parsePublishableKey } from '@clerk/shared/keys'
import { requireEnv } from '../config/env.js'

/*
 * Plan check [billing.ts]: is this user on the Pro plan? Plans live in Clerk
 * Billing (Dashboard -> Billing -> Plans -> User Plans).
 */

/** Slug of the paid plan, as set in the Clerk Dashboard. Case-sensitive. */
export function proPlanSlug(): string {
  return process.env.PRO_PLAN_SLUG?.trim() || 'pro'
}

/** The `has()` check from a Clerk session, when the request has one. */
type SessionHas = (params: { plan: string }) => boolean

export interface ProPlanCheck {
  clerk: ClerkClient
  userId: string
  /**
   * Fast path: the plan claim in the user's session token. Optional, since
   * only web requests have a session (WhatsApp messages and background tasks
   * don't).
   */
  sessionHas?: SessionHas
}

/**
 * True if the user has an active Pro subscription.
 *
 * The session token can be up to a minute old, so right after subscribing it
 * may not show the plan yet. When the fast check says no, ask Clerk's billing
 * API, which is always current. Users already on Pro cost no API call.
 */
export async function hasProPlan({ clerk, userId, sessionHas }: ProPlanCheck): Promise<boolean> {
  const slug = proPlanSlug()
  if (sessionHas?.({ plan: slug })) return true

  try {
    const subscription = await clerk.billing.getUserBillingSubscription(userId)
    return subscription.subscriptionItems.some(
      (item) => item.status === 'active' && item.plan?.slug === slug,
    )
  } catch (err) {
    // 404 = the user has no subscription at all. Anything else (billing not
    // enabled, Clerk unreachable) also fails closed, but is worth logging.
    if ((err as { status?: number }).status !== 404) {
      console.error('[billing] could not read subscription for', userId, err)
    }
    return false
  }
}

/**
 * Where users go to subscribe or manage their plan: the billing page of
 * Clerk's hosted Account Portal.
 */
export function upgradeUrl(): string {
  const key = parsePublishableKey(requireEnv('CLERK_PUBLISHABLE_KEY'))
  if (!key) throw new Error('CLERK_PUBLISHABLE_KEY is not a valid Clerk publishable key')
  return `${buildAccountsBaseUrl(key.frontendApi)}/user/billing`
}
