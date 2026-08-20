/**
 * Provider-aware reasoning-effort injection.
 *
 * opencode represents reasoning effort as a flat entry in the `options` object
 * that `chat.params` hands to plugins, but the exact key depends on the
 * provider's AI SDK package (`model.api.npm`). We mirror the keys opencode's own
 * variant computation uses so our injected value flows through the exact same
 * path.
 *
 * Only providers whose reasoning-effort option is literally `reasoningEffort`
 * belong here. Some providers name it differently and are deliberately NOT
 * mapped (they would need a different key, so `reasoningEffort` would be a
 * silent no-op):
 *   - Google / Vertex (`@ai-sdk/google`) -> `thinkingConfig.thinkingLevel`
 *   - Amazon Bedrock (`@ai-sdk/amazon-bedrock`) -> `reasoningConfig`
 */
const EFFORT_KEY: Record<string, string> = {
  "@ai-sdk/anthropic": "reasoningEffort",
  "@ai-sdk/azure": "reasoningEffort",
  "@ai-sdk/cerebras": "reasoningEffort",
  "@ai-sdk/deepinfra": "reasoningEffort",
  "@ai-sdk/deepseek": "reasoningEffort",
  "@ai-sdk/fireworks": "reasoningEffort",
  "@ai-sdk/groq": "reasoningEffort",
  "@ai-sdk/mistral": "reasoningEffort",
  "@ai-sdk/openai": "reasoningEffort",
  "@ai-sdk/openai-compatible": "reasoningEffort",
  "@ai-sdk/openrouter": "reasoningEffort",
  "@ai-sdk/perplexity": "reasoningEffort",
  "@ai-sdk/togetherai": "reasoningEffort",
  "@ai-sdk/xai": "reasoningEffort",
}

/**
 * Return the `options` key to set for reasoning effort, or `undefined` when the
 * provider does not support an OpenAI-style `reasoningEffort` key.
 */
export function effortKeyFor(npm: string | undefined): string | undefined {
  if (!npm) return undefined
  return EFFORT_KEY[npm]
}
