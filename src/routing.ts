import type { Complexity } from "./classifier.js"
import type { NormalizedConfig } from "./config.js"

/**
 * Model-routing helpers for automatic per-message model selection.
 *
 * Automatic model routing works through the `chat.message` hook: opencode
 * persists the hook's `output.message` (including its `model` field) before
 * the message is processed, and the saved message's model is what drives the
 * LLM request (`getModel(lastUser.model.providerID, lastUser.model.modelID)`).
 * These helpers are pure so the mapping can be unit-tested without a server.
 */

export interface ModelSpec {
  providerID: string
  modelID: string
}

/**
 * Parse a `provider/model` specifier into provider + model IDs.
 * Returns `undefined` for anything that is not a two-part `provider/model`.
 */
export function parseModelSpec(spec: string): ModelSpec | undefined {
  if (typeof spec !== "string") return undefined
  const slash = spec.indexOf("/")
  if (slash <= 0 || slash === spec.length - 1) return undefined
  const providerID = spec.slice(0, slash)
  const modelID = spec.slice(slash + 1)
  if (!providerID || !modelID) return undefined
  return { providerID, modelID }
}

/**
 * Pick the model specifier configured for a classified complexity tier.
 * `normal` falls back to the eco model when no normal slot is configured
 * (three-model setups only); returns `undefined` when the tier has no
 * configured model (nothing to route to).
 */
export function routeTarget(complexity: Complexity, config: NormalizedConfig): string | undefined {
  switch (complexity) {
    case "eco":
      return config.ecoModel || undefined
    case "normal":
      return config.normalModel || config.ecoModel || undefined
    case "sport":
      return config.sportModel || undefined
  }
}

/**
 * Whether a message already runs on the given model — skip the write when the
 * routed target matches, to avoid needless session-model churn.
 */
export function isSameModel(current: { providerID: string; modelID: string } | undefined, target: ModelSpec): boolean {
  if (!current) return false
  return current.providerID === target.providerID && current.modelID === target.modelID
}
