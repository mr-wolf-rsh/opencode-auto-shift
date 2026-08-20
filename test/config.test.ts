import { describe, expect, it } from "vitest"
import { DEFAULT_SPORT_KEYWORDS } from "../src/classifier.js"
import { normalizeConfig, resolveEffort } from "../src/config.js"

describe("normalizeConfig", () => {
  it("defaults to empty modes, empty gear table, and a 1/2/3 shift program", () => {
    const cfg = normalizeConfig(undefined)
    expect(cfg.enabled).toBe(true)
    expect(cfg.ecoModel).toBe("")
    expect(cfg.normalModel).toBe("")
    expect(cfg.sportModel).toBe("")
    expect(cfg.gears.enabled).toBe(true)
    expect(cfg.gears.table).toEqual({})
    expect(cfg.shifts).toEqual({ eco: 1, normal: 2, sport: 3 })
    expect(cfg.useLLMClassifier).toBe(false)
  })

  it("reads model targets from the modes block", () => {
    const cfg = normalizeConfig({ modes: { eco: "openai/gpt-5-nano", sport: "openai/gpt-5" } })
    expect(cfg.ecoModel).toBe("openai/gpt-5-nano")
    expect(cfg.sportModel).toBe("openai/gpt-5")
    expect(cfg.normalModel).toBe("")
  })

  it("reads the normal model slot (3-mode setups)", () => {
    const cfg = normalizeConfig({ modes: { eco: "a/x", normal: "b/y", sport: "c/z" } })
    expect(cfg.ecoModel).toBe("a/x")
    expect(cfg.normalModel).toBe("b/y")
    expect(cfg.sportModel).toBe("c/z")
  })

  it("builds the gear table from numbered keys, skipping reserved fields", () => {
    const cfg = normalizeConfig({
      gears: { "1": "low", "2": "high", "3": "max", key: "reasoningEffort", enabled: true },
    })
    expect(cfg.gears.table).toEqual({ "1": "low", "2": "high", "3": "max" })
    expect(cfg.gears.key).toBe("reasoningEffort")
    expect(cfg.gears.enabled).toBe(true)
  })

  it("ignores non-string gear values", () => {
    const cfg = normalizeConfig({ gears: { "1": "low", "2": 2, "3": null, "4": true } })
    expect(cfg.gears.table).toEqual({ "1": "low" })
  })

  it("merges custom sport keywords with the built-in defaults", () => {
    const cfg = normalizeConfig({ sport_keywords: ["kubernetes"] })
    expect(cfg.sportKeywords).toContain("kubernetes")
    expect(cfg.sportKeywords.length).toBeGreaterThan(DEFAULT_SPORT_KEYWORDS.length)
  })

  it("gears: false disables effort routing", () => {
    const cfg = normalizeConfig({ gears: false })
    expect(cfg.gears.enabled).toBe(false)
  })

  it("respects the master kill switch", () => {
    expect(normalizeConfig({ enabled: false }).enabled).toBe(false)
  })

  it("reads the shift program, falling back to 1/2/3 for missing tiers", () => {
    const cfg = normalizeConfig({ shifts: { sport: 3 } })
    expect(cfg.shifts).toEqual({ eco: 1, normal: 2, sport: 3 })

    const custom = normalizeConfig({ shifts: { eco: 1, normal: 2, sport: 4 } })
    expect(custom.shifts.sport).toBe(4)
  })

  it("reads normal keywords and the normal tier", () => {
    const cfg = normalizeConfig({ normal_keywords: ["deploy"] })
    expect(cfg.normalKeywords).toEqual(["deploy"])
  })

  it("has empty normal keywords by default (2-mode)", () => {
    expect(normalizeConfig(undefined).normalKeywords).toEqual([])
  })
})

describe("resolveEffort", () => {
  const config = normalizeConfig({
    gears: { "1": "low", "2": "high", "3": "max" },
    shifts: { eco: 1, normal: 2, sport: 3 },
  })

  it("maps complexity tiers to their shift-program gears", () => {
    expect(resolveEffort("eco", config)).toEqual({ gear: 1, effort: "low" })
    expect(resolveEffort("normal", config)).toEqual({ gear: 2, effort: "high" })
    expect(resolveEffort("sport", config)).toEqual({ gear: 3, effort: "max" })
  })

  it("returns undefined when the shift points at an unconfigured gear", () => {
    const sparse = normalizeConfig({
      gears: { "1": "low" },
      shifts: { eco: 1, sport: 3 },
    })
    expect(resolveEffort("sport", sparse)).toBeUndefined()
    expect(resolveEffort("eco", sparse)).toEqual({ gear: 1, effort: "low" })
  })

  it("allows any mode to map to any gear (orthogonality)", () => {
    // sport model at gear 1 = low effort — expressible because shifts are free.
    const cfg = normalizeConfig({
      gears: { "1": "low", "2": "medium", "3": "high" },
      shifts: { eco: 1, normal: 2, sport: 1 },
    })
    expect(resolveEffort("sport", cfg)).toEqual({ gear: 1, effort: "low" })
  })
})
