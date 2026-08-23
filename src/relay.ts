import type { ModelSpec } from "./routing.js"

/**
 * TTL-bounded registry of in-flight `switch_mode` relays, keyed by session ID.
 *
 * A relayed message must be exempt from auto-routing exactly once: it carries
 * an explicit model override, so re-classifying it would bounce the switch
 * back. Sessions process messages serially, so the relayed message is always
 * the next `chat.message` event for the session — the hook consumes the entry
 * when that message arrives. The TTL bounds the leak if the relayed message
 * never arrives (e.g. the server dropped it), so a stale entry can never
 * suppress auto-routing for later messages forever.
 */
export interface PendingSwitch {
  spec: ModelSpec
  expires: number
}

/** How long a relayed switch stays fresh waiting for its message to arrive. */
export const SWITCH_RELAY_TTL_MS = 5 * 60_000

export class PendingSwitchRegistry {
  private entries = new Map<string, PendingSwitch>()

  constructor(private ttlMs: number = SWITCH_RELAY_TTL_MS) {}

  set(sessionID: string, spec: ModelSpec): void {
    this.entries.set(sessionID, { spec, expires: Date.now() + this.ttlMs })
  }

  /**
   * Consume the pending switch for a session if one exists and is still fresh.
   * The entry is always removed — an expired relay is dropped, never deferred,
   * so it cannot accidentally exempt a later message from auto-routing.
   */
  take(sessionID: string): ModelSpec | undefined {
    const entry = this.entries.get(sessionID)
    if (!entry) return undefined
    this.entries.delete(sessionID)
    return Date.now() < entry.expires ? entry.spec : undefined
  }

  clear(sessionID: string): void {
    this.entries.delete(sessionID)
  }
}
