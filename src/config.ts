import { DEFAULT_KEYWORDS, type LLMClassifierConfig } from "./classifier.js"

/**
 * User-facing plugin options, as supplied in the `plugin` array of
 * `opencode.json`:
 *
 * ```json
 * ["opencode-model-router", {
 *   "default": "deepseek/deepseek-v4-flash",
 *   "complex": "deepseek/deepseek-v4-pro",
 *   "keywords": ["architecture", "refactor"],
 *   "use_llm_classifier": false,
 *   "variant": { "complex": "high", "routine": "low" }
 * }]
 * ```
 */
export interface RouterConfig {
  /** Master kill switch. `false` makes the plugin a complete no-op. */
  enabled?: boolean
  /** Routine/default model (`provider/model`). Used by the `route` tool. */
  default?: string
  /** Complex model (`provider/model`). Used by the `route` tool. */
  complex?: string
  /** Extra escalation keywords, merged with the built-in defaults. */
  keywords?: string[]
  /** Enable the optional LLM classifier (adds one tiny call per message). */
  use_llm_classifier?: boolean
  /** Endpoint config for the LLM classifier. */
  llm_classifier?: LLMClassifierConfig
  /** Reasoning-effort routing. Set to `false` to disable. */
  variant?: VariantConfig | false
  /** Log routing decisions to stderr (for debugging the classifier). */
  debug?: boolean
}

export interface VariantConfig {
  /** Whether effort routing is active. Defaults to `true`. */
  enabled?: boolean
  /** Effort value for complex messages (e.g. `"high"`). */
  complex?: string
  /** Effort value for routine messages (e.g. `"low"`). */
  routine?: string
  /**
   * Override the `options` key used to set reasoning effort. When omitted the
   * plugin picks the key from a built-in provider map (e.g. `reasoningEffort`
   * for OpenAI-compatible providers such as DeepSeek).
   */
  key?: string
}

export interface NormalizedConfig {
  enabled: boolean
  defaultModel: string
  complexModel: string
  keywords: string[]
  useLLMClassifier: boolean
  llmClassifier?: LLMClassifierConfig
  variant: {
    enabled: boolean
    complex?: string
    routine?: string
    key?: string
  }
  debug: boolean
}

export function normalizeConfig(input: unknown): NormalizedConfig {
  const raw = (input ?? {}) as RouterConfig

  const variant = raw.variant === false ? { enabled: false } : (raw.variant ?? {})

  return {
    enabled: raw.enabled ?? true,
    defaultModel: raw.default ?? "deepseek/deepseek-v4-flash",
    complexModel: raw.complex ?? "deepseek/deepseek-v4-pro",
    keywords: [...DEFAULT_KEYWORDS, ...(raw.keywords ?? [])],
    useLLMClassifier: raw.use_llm_classifier ?? false,
    llmClassifier: raw.llm_classifier,
    variant: {
      enabled: variant.enabled ?? true,
      complex: variant.complex ?? "high",
      routine: variant.routine ?? "low",
      key: variant.key,
    },
    debug: raw.debug ?? false,
  }
}
