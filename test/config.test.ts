import { describe, expect, it } from "vitest"
import { DEFAULT_KEYWORDS } from "../src/classifier.js"
import { normalizeConfig } from "../src/config.js"

describe("normalizeConfig", () => {
  it("defaults to model-agnostic empty targets", () => {
    const cfg = normalizeConfig(undefined)
    expect(cfg.enabled).toBe(true)
    expect(cfg.defaultModel).toBe("")
    expect(cfg.complexModel).toBe("")
    expect(cfg.variant.enabled).toBe(true)
    expect(cfg.variant.complex).toBe("high")
    expect(cfg.variant.routine).toBe("low")
    expect(cfg.useLLMClassifier).toBe(false)
  })

  it("reads model targets when provided", () => {
    const cfg = normalizeConfig({ default: "openai/gpt-5-nano", complex: "openai/gpt-5" })
    expect(cfg.defaultModel).toBe("openai/gpt-5-nano")
    expect(cfg.complexModel).toBe("openai/gpt-5")
  })

  it("merges custom keywords with the built-in defaults", () => {
    const cfg = normalizeConfig({ keywords: ["kubernetes"] })
    expect(cfg.keywords).toContain("kubernetes")
    expect(cfg.keywords.length).toBeGreaterThan(DEFAULT_KEYWORDS.length)
  })

  it("variant: false disables effort routing", () => {
    expect(normalizeConfig({ variant: false }).variant.enabled).toBe(false)
  })

  it("respects the master kill switch", () => {
    expect(normalizeConfig({ enabled: false }).enabled).toBe(false)
  })
})
