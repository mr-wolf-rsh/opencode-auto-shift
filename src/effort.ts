/**
 * Provider-aware reasoning-effort injection.
 *
 * opencode represents reasoning effort as a flat entry in the `options` object
 * that `chat.params` hands to plugins, but the exact key depends on the
 * provider's AI SDK package (`model.api.npm`). We mirror the keys opencode's own
 * variant computation uses so our injected value flows through the exact same
 * path.
 */
const EFFORT_KEY: Record<string, string> = {
  "@ai-sdk/openai-compatible": "reasoningEffort",
  "@ai-sdk/openai": "reasoningEffort",
  "@ai-sdk/deepseek": "reasoningEffort",
  "@ai-sdk/azure": "reasoningEffort",
  "@ai-sdk/xai": "reasoningEffort",
  "@ai-sdk/groq": "reasoningEffort",
  "@ai-sdk/cerebras": "reasoningEffort",
  "@ai-sdk/mistral": "reasoningEffort",
  "@ai-sdk/deepinfra": "reasoningEffort",
  "@ai-sdk/togetherai": "reasoningEffort",
}

/**
 * Return the `options` key to set for reasoning effort, or `undefined` when the
 * provider does not support an OpenAI-style `reasoningEffort` key.
 */
export function effortKeyFor(npm: string | undefined): string | undefined {
  if (!npm) return undefined
  return EFFORT_KEY[npm]
}
