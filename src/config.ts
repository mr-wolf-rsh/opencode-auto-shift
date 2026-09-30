import { DEFAULT_SPORT_KEYWORDS, type Complexity, type LLMClassifierConfig } from "./classifier.js"

/**
 * User-facing plugin options, as supplied in the `plugin` array of
 * `opencode.json`:
 *
 * ```json
 * ["opencode-auto-shift", {
 *   "modes": {
 *     "eco": "provider/eco-model",
 *     "normal": "provider/normal-model",
 *     "sport": "provider/sport-model"
 *   },
 *   "gears": { "1": "low", "2": "high", "3": "max" },
 *   "shifts": { "eco": 1, "normal": 2, "sport": 3 }
 * }]
 * ```
 *
 * The three blocks are deliberately independent:
 * - `modes`  — drive modes = model tiers (`provider/model`), used by `switch_mode`.
 * - `gears`  — the numbered transmission: gear position -> reasoning-effort string.
 * - `shifts` — the automatic shift program: classifier complexity -> gear position.
 *
 * No axis is fixed to another. Any model can run at any gear (e.g. the sport
 * model at gear 1) — the classifier output, the gear table, and the shift
 * program are all user-configurable.
 */
export interface AutoShiftConfig {
  /** Master kill switch. `false` makes the plugin a complete no-op. */
  enabled?: boolean
  /** Drive modes = model tiers. Each mode maps to a concrete `provider/model`. */
  modes?: {
    /** Eco/baseline model. Informational: the plugin lowers effort on whatever model is active. */
    eco?: string
    /** Normal/middle model, used by the `switch_mode` tool. Optional (2-mode setups). */
    normal?: string
    /** Sport/escalation model, used by the `switch_mode` tool. */
    sport?: string
  }
  /** Extra sport-mode escalation keywords, merged with the built-in defaults. */
  sport_keywords?: string[]
  /**
   * Optional normal-mode keywords. When non-empty, the classifier gains a
   * "normal" tier between eco and sport (for three-model setups).
   */
  normal_keywords?: string[]
  /** Enable the optional LLM classifier (adds one tiny call per message). */
  use_llm_classifier?: boolean
  /** Endpoint config for the LLM classifier. */
  llm_classifier?: LLMClassifierConfig
  /**
   * Automatically route each user message to the model of its classified
   * drive mode (eco/normal/sport -> `modes.eco` / `modes.normal` / `modes.sport`).
   * Requires a recent opencode that persists the `chat.message` hook's message
   * mutation (message-level model override). Off by default; only messages that
   * belong to the session's primary agent are routed (subagent messages keep
   * their own configured models).
   */
  auto_route_models?: boolean
  /**
   * The gearbox: numbered gear positions (`"1"`, `"2"`, ...) mapped to
   * reasoning-effort strings passed through verbatim to the provider. `key`
   * overrides the `options` key used to set effort (defaults to a built-in
   * per-provider map). Set to `false` to disable gear routing entirely.
   *
   * There is intentionally no default table — effort values are
   * provider-specific, so a shared default would be wrong for at least some
   * providers. Without a configured gear the plugin injects nothing.
   */
  gears?: GearsConfig | false
  /**
   * The automatic shift program: classifier complexity (eco/normal/sport) ->
   * gear position in the `gears` table. Defaults to eco=1, normal=2, sport=3.
   */
  shifts?: ShiftConfig
  /**
   * Text-directive layer: let the user force a drive mode and/or gear by
   * typing an override at the start of a message (`!sport`, `go eco`,
   * `!gear 3`, `stay on normal`, `back to auto`, ...). Provider-agnostic —
   * directives resolve to abstract mode slots and gear numbers, never model
   * names.
   */
  directives?: {
    /** Kill switch for the directive layer. Defaults to `true`. */
    enabled?: boolean
    /** User messages a sticky override survives. Defaults to `10`. */
    sticky_turns?: number
    /** User word -> tier aliases ("eco" | "normal" | "sport"), highest precedence. */
    aliases?: Record<string, string>
  }
  /** Log routing decisions to stderr (for debugging the classifier). */
  debug?: boolean
}

export interface GearsConfig {
  /** Whether gear (effort) routing is active. Defaults to `true`. */
  enabled?: boolean
  /**
   * Override the `options` key used to set reasoning effort. When omitted the
   * plugin picks the key from a built-in provider map (e.g. `reasoningEffort`
   * for OpenAI-compatible providers).
   */
  key?: string
  /** Numbered gear positions mapped to provider effort strings (e.g. `"1": "low"`). */
  [gear: string]: string | boolean | undefined
}

export interface ShiftConfig {
  /** Gear position for eco-classified messages. Defaults to `1`. */
  eco?: number
  /** Gear position for normal-classified messages. Defaults to `2`. */
  normal?: number
  /** Gear position for sport-classified messages. Defaults to `3`. */
  sport?: number
}

export interface NormalizedConfig {
  enabled: boolean
  ecoModel: string
  normalModel: string
  sportModel: string
  autoRouteModels: boolean
  sportKeywords: string[]
  normalKeywords: string[]
  useLLMClassifier: boolean
  llmClassifier?: LLMClassifierConfig
  gears: {
    enabled: boolean
    key?: string
    /** Gear position -> effort string. */
    table: Record<string, string>
  }
  shifts: {
    eco: number
    normal: number
    sport: number
  }
  directives: {
    enabled: boolean
    stickyTurns: number
    modeWords: Map<string, Complexity>
  }
  debug: boolean
}

export function normalizeConfig(input: unknown): NormalizedConfig {
  const raw = (input ?? {}) as AutoShiftConfig
  const modes = raw.modes ?? {}
  const gearsRaw = raw.gears === false ? { enabled: false } : (raw.gears ?? {})

  // Build the gear table from every string-valued key other than the reserved
  // `enabled` / `key` fields.
  const table: Record<string, string> = {}
  for (const [gear, value] of Object.entries(gearsRaw)) {
    if (gear === "enabled" || gear === "key") continue
    if (typeof value === "string") table[gear] = value
  }

  const shifts = raw.shifts ?? {}

  return {
    enabled: raw.enabled ?? true,
    ecoModel: modes.eco ?? "",
    normalModel: modes.normal ?? "",
    sportModel: modes.sport ?? "",
    sportKeywords: [...DEFAULT_SPORT_KEYWORDS, ...(raw.sport_keywords ?? [])],
    normalKeywords: [...(raw.normal_keywords ?? [])],
    useLLMClassifier: raw.use_llm_classifier ?? false,
    llmClassifier: raw.llm_classifier,
    autoRouteModels: raw.auto_route_models ?? false,
    gears: {
      enabled: gearsRaw.enabled ?? true,
      key: typeof gearsRaw.key === "string" ? gearsRaw.key : undefined,
      table,
    },
    shifts: {
      eco: shifts.eco ?? 1,
      normal: shifts.normal ?? 2,
      sport: shifts.sport ?? 3,
    },
    directives: {
      enabled: raw.directives?.enabled ?? true,
      stickyTurns: raw.directives?.sticky_turns ?? 10,
      modeWords: deriveModeWords(modes, raw.directives?.aliases),
    },
    debug: raw.debug ?? false,
  }
}

/**
 * Resolve a classifier complexity tier to a concrete gear + effort value.
 * Returns `undefined` when the shift program points at a gear position that
 * has no entry in the gear table (nothing to inject).
 */
export function resolveEffort(
  complexity: Complexity,
  config: NormalizedConfig,
): { gear: number; effort: string } | undefined {
  const gear = config.shifts[complexity]
  const effort = config.gears.table[String(gear)]
  if (effort === undefined) return undefined
  return { gear, effort }
}

const TIER_ORDER: Record<Complexity, number> = { eco: 0, normal: 1, sport: 2 }

const BUILTIN_MODE_WORDS: Record<Complexity, string[]> = {
  eco: ["eco", "fast", "lite"],
  normal: ["normal", "balanced"],
  sport: ["sport", "heavy"],
}

const TIERS = ["eco", "normal", "sport"] as const

/**
 * Build the provider-agnostic word -> tier map used by the directive parser.
 * Pure. Layering, lowest precedence first (later wins on conflict):
 *
 * 1. Built-in abstract words: eco -> {eco,fast,lite}, normal -> {normal,balanced},
 *    sport -> {sport,heavy}.
 * 2. Derived from configured model IDs: for each mode with a non-empty model,
 *    take the substring after the last `/`, split on `-` and `.`, keep alphabetic
 *    tokens of length >= 2 (dropping version-like tokens). A token is ambiguous
 *    when it maps to more than one DISTINCT model ID: if those modes share the
 *    same model ID it maps to the lowest tier (eco < normal < sport), otherwise
 *    it is dropped.
 * 3. Explicit `aliases` — values normalized (lowercase; must be eco/normal/sport,
 *    else the entry is ignored).
 */
export function deriveModeWords(
  modes: { eco?: string; normal?: string; sport?: string },
  explicit?: Record<string, string>,
): Map<string, Complexity> {
  const result = new Map<string, Complexity>()

  for (const tier of TIERS) {
    for (const word of BUILTIN_MODE_WORDS[tier]) {
      result.set(word, tier)
    }
  }

  const byToken = new Map<string, Array<{ tier: Complexity; modelID: string }>>()
  for (const tier of TIERS) {
    const model = modes[tier]
    if (!model) continue
    const modelID = model.slice(model.lastIndexOf("/") + 1)
    for (const raw of modelID.split(/[-.]/)) {
      const token = raw.toLowerCase()
      if (!/^[a-z]{2,}$/.test(token)) continue
      if (/^v?\d/.test(token)) continue
      const list = byToken.get(token) ?? []
      list.push({ tier, modelID })
      byToken.set(token, list)
    }
  }

  for (const [token, list] of byToken) {
    const distinctModels = new Set(list.map((entry) => entry.modelID))
    if (distinctModels.size > 1) continue
    const lowest = list.reduce<Complexity>(
      (acc, entry) => (TIER_ORDER[entry.tier] < TIER_ORDER[acc] ? entry.tier : acc),
      list[0].tier,
    )
    result.set(token, lowest)
  }

  if (explicit) {
    for (const [word, value] of Object.entries(explicit)) {
      const tier = value.trim().toLowerCase() as Complexity
      if (tier === "eco" || tier === "normal" || tier === "sport") {
        result.set(word.toLowerCase(), tier)
      }
    }
  }

  return result
}
