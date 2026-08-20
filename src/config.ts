import { DEFAULT_SPORT_KEYWORDS, type LLMClassifierConfig } from "./classifier.js"

/**
 * User-facing plugin options, as supplied in the `plugin` array of
 * `opencode.json`:
 *
 * ```json
 * ["opencode-auto-shift", {
 *   "eco": "provider/eco-model",
 *   "sport": "provider/sport-model",
 *   "sport_keywords": ["architecture", "refactor"],
 *   "gears": { "sport": "high", "eco": "low" }
 * }]
 * ```
 */
export interface AutoShiftConfig {
  /** Master kill switch. `false` makes the plugin a complete no-op. */
  enabled?: boolean
  /**
   * Your eco/baseline model (`provider/model`). Informational: the plugin
   * lowers effort on whatever model is active rather than switching to it.
   */
  eco?: string
  /** Sport/escalation model (`provider/model`), used by the `shift` tool. */
  sport?: string
  /** Extra sport-mode escalation keywords, merged with the built-in defaults. */
  sport_keywords?: string[]
  /**
   * Optional normal-mode keywords. When non-empty, the classifier gains a
   * "normal" tier between eco and sport (for three-model setups such as
   * Claude Haiku / Sonnet / Opus).
   */
  normal_keywords?: string[]
  /** Enable the optional LLM classifier (adds one tiny call per message). */
  use_llm_classifier?: boolean
  /** Endpoint config for the LLM classifier. */
  llm_classifier?: LLMClassifierConfig
  /** Gear (reasoning-effort) routing. Set to `false` to disable. */
  gears?: GearsConfig | false
  /** Log routing decisions to stderr (for debugging the classifier). */
  debug?: boolean
}

export interface GearsConfig {
  /** Whether gear (effort) routing is active. Defaults to `true`. */
  enabled?: boolean
  /** Effort value in sport mode (e.g. `"high"`). */
  sport?: string
  /** Effort value in normal mode (e.g. `"medium"`). */
  normal?: string
  /** Effort value in eco mode (e.g. `"low"`). */
  eco?: string
  /**
   * Override the `options` key used to set reasoning effort. When omitted the
   * plugin picks the key from a built-in provider map (e.g. `reasoningEffort`
   * for OpenAI-compatible providers).
   */
  key?: string
}

export interface NormalizedConfig {
  enabled: boolean
  ecoModel: string
  sportModel: string
  sportKeywords: string[]
  normalKeywords: string[]
  useLLMClassifier: boolean
  llmClassifier?: LLMClassifierConfig
  gears: {
    enabled: boolean
    sport?: string
    normal?: string
    eco?: string
    key?: string
  }
  debug: boolean
}

export function normalizeConfig(input: unknown): NormalizedConfig {
  const raw = (input ?? {}) as AutoShiftConfig

  const gears = raw.gears === false ? { enabled: false } : (raw.gears ?? {})

  return {
    enabled: raw.enabled ?? true,
    ecoModel: raw.eco ?? "",
    sportModel: raw.sport ?? "",
    sportKeywords: [...DEFAULT_SPORT_KEYWORDS, ...(raw.sport_keywords ?? [])],
    normalKeywords: [...(raw.normal_keywords ?? [])],
    useLLMClassifier: raw.use_llm_classifier ?? false,
    llmClassifier: raw.llm_classifier,
    gears: {
      enabled: gears.enabled ?? true,
      sport: gears.sport ?? "high",
      normal: gears.normal ?? "medium",
      eco: gears.eco ?? "low",
      key: gears.key,
    },
    debug: raw.debug ?? false,
  }
}
