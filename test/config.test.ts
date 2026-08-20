import { describe, expect, it } from "vitest"
import { DEFAULT_SPORT_KEYWORDS } from "../src/classifier.js"
import { normalizeConfig } from "../src/config.js"

describe("normalizeConfig", () => {
  it("defaults to model-agnostic empty targets", () => {
    const cfg = normalizeConfig(undefined)
    expect(cfg.enabled).toBe(true)
    expect(cfg.ecoModel).toBe("")
    expect(cfg.sportModel).toBe("")
    expect(cfg.gears.enabled).toBe(true)
    expect(cfg.gears.sport).toBe("high")
    expect(cfg.gears.eco).toBe("low")
    expect(cfg.useLLMClassifier).toBe(false)
  })

  it("reads model targets when provided", () => {
    const cfg = normalizeConfig({ eco: "openai/gpt-5-nano", sport: "openai/gpt-5" })
    expect(cfg.ecoModel).toBe("openai/gpt-5-nano")
    expect(cfg.sportModel).toBe("openai/gpt-5")
  })

  it("merges custom sport keywords with the built-in defaults", () => {
    const cfg = normalizeConfig({ sport_keywords: ["kubernetes"] })
    expect(cfg.sportKeywords).toContain("kubernetes")
    expect(cfg.sportKeywords.length).toBeGreaterThan(DEFAULT_SPORT_KEYWORDS.length)
  })

  it("gears: false disables effort routing", () => {
    expect(normalizeConfig({ gears: false }).gears.enabled).toBe(false)
  })

  it("respects the master kill switch", () => {
    expect(normalizeConfig({ enabled: false }).enabled).toBe(false)
  })

  it("defaults gears.normal to 'medium'", () => {
    expect(normalizeConfig(undefined).gears.normal).toBe("medium")
  })

  it("reads normal keywords and normal effort", () => {
    const cfg = normalizeConfig({ normal_keywords: ["deploy"], gears: { normal: "medium" } })
    expect(cfg.normalKeywords).toEqual(["deploy"])
    expect(cfg.gears.normal).toBe("medium")
  })

  it("has empty normal keywords by default (2-mode)", () => {
    expect(normalizeConfig(undefined).normalKeywords).toEqual([])
  })
})
