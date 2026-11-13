import type { ClerkClient } from '@clerk/backend'
import { hasProPlan, upgradeUrl } from '../accounts/billing.js'

/*
 * Channel gate [channel-gate.ts]: decides whether an incoming message may
 * reach the assistant. Every channel goes through here before any work is done.
 */

export type GateResult =
  /** Linked and on Pro: hand the message to the assistant. */
  | { status: 'allowed' }
  /** Known user without Pro: reply with the upgrade message. */
  | { status: 'upgrade_required'; upgradeUrl: string }
  /**
   * The sender's chat account isn't linked to a user yet. Only happens on
   * chat-app channels (WhatsApp); web users are always signed in.
   */
  | { status: 'link_required' }

export const UPGRADE_MESSAGE = 'The assistant is available on the Pro plan.'

export interface GateInput {
  clerk: ClerkClient
  /** The Clerk user behind the message, or null if not linked. */
  clerkUserId: string | null
  /** Session plan check, when the request has a Clerk session. */
  sessionHas?: (params: { plan: string }) => boolean
}

export async function gateInbound({ clerk, clerkUserId, sessionHas }: GateInput): Promise<GateResult> {
  if (!clerkUserId) return { status: 'link_required' }
  if (await hasProPlan({ clerk, userId: clerkUserId, sessionHas })) return { status: 'allowed' }
  return { status: 'upgrade_required', upgradeUrl: upgradeUrl() }
}
