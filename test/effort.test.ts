import { describe, expect, it } from "vitest"
import { effortKeyFor } from "../src/effort.js"

describe("effortKeyFor", () => {
  it("maps reasoningEffort-capable providers", () => {
    const mapped = [
      "@ai-sdk/anthropic",
      "@ai-sdk/openai",
      "@ai-sdk/openai-compatible",
      "@ai-sdk/deepseek",
      "@ai-sdk/xai",
      "@ai-sdk/groq",
      "@ai-sdk/perplexity",
      "@ai-sdk/openrouter",
      "@ai-sdk/fireworks",
    ]
    for (const npm of mapped) {
      expect(effortKeyFor(npm)).toBe("reasoningEffort")
    }
  })

  it("returns undefined for providers with a different reasoning mechanism", () => {
    // Google uses thinkingConfig.thinkingLevel; Bedrock uses reasoningConfig.
    expect(effortKeyFor("@ai-sdk/google")).toBeUndefined()
    expect(effortKeyFor("@ai-sdk/amazon-bedrock")).toBeUndefined()
  })

  it("returns undefined for unknown or missing packages", () => {
    expect(effortKeyFor("@ai-sdk/unknown")).toBeUndefined()
    expect(effortKeyFor(undefined)).toBeUndefined()
  })
})
