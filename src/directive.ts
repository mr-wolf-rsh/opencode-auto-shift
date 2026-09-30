import type { Complexity } from "./classifier.js"

/**
 * A text directive parsed from the start of a user message. Exactly one of
 * `mode` / `gear` / `clear` is meaningful per directive: a mode word (or
 * alias), a `gear N`, or `auto` (clear). Directives are provider-agnostic —
 * they resolve to abstract mode slots (`eco`/`normal`/`sport`) and gear
 * numbers, never to concrete model names.
 */
export interface Directive {
  /** Drive mode tier, set only when a mode word/alias was given. */
  mode?: Complexity
  /** Gear position, set only when `gear N` was given. */
  gear?: number
  /** `true` = write a sticky override; `false` = per-message only. */
  sticky: boolean
  /** `true` = "back to auto": clear all sticky overrides. */
  clear: boolean
}

/**
 * Sigil form: `!sport`, `!gear 3`, `!stay sport`, `!lock gear 2`, `!auto`.
 * Group 1 = sticky verb, group 2 = gear number, group 3 = mode word.
 */
const SIGIL_RE =
  /^!\s*(?:(stay|lock|hold)\s+)?(?:(?:gear\s+(\d+))|auto|([a-z][a-z0-9_-]*))(?:\s+(?:mode|model))?/i

/** Natural-language clear form, tried first. */
const CLEAR_RE = /^(?:back\s+to\s+auto|resume\s+auto|auto\s+mode|go\s+auto)\b/i

/** Natural-language sticky form. Group 1 = gear number, group 2 = mode word. */
const STICKY_RE =
  /^(?:stay|lock|hold)\s+(?:on\s+)?(?:(?:gear\s+(\d+))|(?:the\s+)?([a-z][a-z0-9_-]*))(?:\s+(?:mode|model))?/i

/** Natural-language gear form. */
const GEAR_RE = /^(?:use|set|go|switch\s+to|shift\s+to)\s+(?:the\s+)?gear\s+(\d+)/i

/** Natural-language mode form. Group 1 = mode word. */
const MODE_RE = /^(?:go|use|switch\s+to|shift\s+to|set)\s+(?:to\s+)?(?:the\s+)?([a-z][a-z0-9_-]*)(?:\s+(?:mode|model))?/i

/**
 * Parse a leading text directive from a user message. Pure — no side effects.
 *
 * A directive is recognized ONLY at the start of the trimmed message (regex
 * anchored with `^`); mid-message words never trigger. Leading whitespace is
 * allowed and matching is case-insensitive. `modeWords` maps lowercased words
 * to tiers (built-in words + derived aliases + config aliases).
 *
 * Returns `undefined` when no directive is present or when a sigil/mode word
 * is not a recognized mode word.
 */
export function parseDirective(
  text: string,
  modeWords: Map<string, Complexity>,
): Directive | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined

  const sigil = SIGIL_RE.exec(trimmed)
  if (sigil) {
    const sticky = sigil[1] !== undefined
    if (sigil[2] !== undefined) {
      return { gear: Number(sigil[2]), sticky, clear: false }
    }
    if (sigil[3] !== undefined) {
      const mode = modeWords.get(sigil[3].toLowerCase())
      if (!mode) return undefined
      return { mode, sticky, clear: false }
    }
    // `auto` alternative.
    return { sticky: false, clear: true }
  }

  if (CLEAR_RE.test(trimmed)) {
    return { sticky: false, clear: true }
  }

  const stickyMatch = STICKY_RE.exec(trimmed)
  if (stickyMatch) {
    if (stickyMatch[1] !== undefined) {
      return { gear: Number(stickyMatch[1]), sticky: true, clear: false }
    }
    const mode = modeWords.get(stickyMatch[2].toLowerCase())
    if (!mode) return undefined
    return { mode, sticky: true, clear: false }
  }

  const gearMatch = GEAR_RE.exec(trimmed)
  if (gearMatch) {
    return { gear: Number(gearMatch[1]), sticky: false, clear: false }
  }

  const modeMatch = MODE_RE.exec(trimmed)
  if (modeMatch) {
    const mode = modeWords.get(modeMatch[1].toLowerCase())
    if (!mode) return undefined
    return { mode, sticky: false, clear: false }
  }

  return undefined
}

/**
 * The single manual override state shared by text directives and the
 * `set_gear` tool. Holds an optional forced mode (drive mode) and an optional
 * forced gear (reasoning effort), independent of each other.
 */
export class StickyOverrides {
  mode: Complexity | null = null
  gear: number | null = null

  /** Remaining user messages to keep the override (`null` = unlimited). */
  private remaining: number | null = null

  /** Set when a tick hit zero; values are reset on the NEXT tick. */
  private pendingClear = false

  /**
   * Apply (partially) a manual override. `turns <= 0` is unlimited (used by
   * the `set_gear` tool); otherwise the override self-expires after `turns`
   * user messages. Fields left out of `update` are preserved.
   */
  apply(update: { mode?: Complexity; gear?: number }, turns: number): void {
    if (update.mode !== undefined) this.mode = update.mode
    if (update.gear !== undefined) this.gear = update.gear
    this.remaining = turns <= 0 ? null : turns
    this.pendingClear = false
  }

  /**
   * Advance one user message. Called once per message at the start of
   * `chat.message`. Returns `true` while an override is in effect, `false`
   * once it has expired.
   *
   * When `remaining` reaches 0 during a tick the values are kept (marked for
   * clear) so `chat.params` — which runs later in the same turn — still sees
   * them; they are reset at the start of the NEXT message.
   */
  tick(): boolean {
    if (this.pendingClear) {
      this.mode = null
      this.gear = null
      this.pendingClear = false
      return false
    }
    if (this.remaining === null) return this.active
    if (this.remaining > 0) {
      this.remaining -= 1
      if (this.remaining === 0) this.pendingClear = true
      return this.active
    }
    return false
  }

  clear(): void {
    this.mode = null
    this.gear = null
    this.remaining = null
    this.pendingClear = false
  }

  get active(): boolean {
    return this.mode !== null || this.gear !== null
  }
}
