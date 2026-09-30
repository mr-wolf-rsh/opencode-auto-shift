import { describe, expect, it } from "vitest"
import { DEFAULT_SPORT_KEYWORDS } from "../src/classifier.js"
import { deriveModeWords, normalizeConfig, resolveEffort } from "../src/config.js"

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

  it("defaults directives to enabled, 10 sticky turns, and built-in mode words", () => {
    const cfg = normalizeConfig(undefined)
    expect(cfg.directives.enabled).toBe(true)
    expect(cfg.directives.stickyTurns).toBe(10)
    expect(cfg.directives.modeWords.get("eco")).toBe("eco")
    expect(cfg.directives.modeWords.get("sport")).toBe("sport")
    expect(cfg.directives.modeWords.get("normal")).toBe("normal")
  })

  it("reads directives config and builds mode words from modes + aliases", () => {
    const cfg = normalizeConfig({
      modes: { eco: "deepseek/deepseek-v4-flash", sport: "deepseek/deepseek-v4-pro" },
      directives: { enabled: false, sticky_turns: 5, aliases: { pro: "sport" } },
    })
    expect(cfg.directives.enabled).toBe(false)
    expect(cfg.directives.stickyTurns).toBe(5)
    expect(cfg.directives.modeWords.get("flash")).toBe("eco")
    expect(cfg.directives.modeWords.get("pro")).toBe("sport")
  })
})

describe("deriveModeWords", () => {
  it("includes the built-in abstract words", () => {
    const words = deriveModeWords({})
    expect(words.get("eco")).toBe("eco")
    expect(words.get("fast")).toBe("eco")
    expect(words.get("lite")).toBe("eco")
    expect(words.get("normal")).toBe("normal")
    expect(words.get("balanced")).toBe("normal")
    expect(words.get("sport")).toBe("sport")
    expect(words.get("heavy")).toBe("sport")
  })

  it("derives tokens from model IDs and resolves same-model ambiguity to the lowest tier", () => {
    const words = deriveModeWords({
      eco: "deepseek/deepseek-v4-flash",
      normal: "deepseek/deepseek-v4-flash",
      sport: "deepseek/deepseek-v4-pro",
    })
    expect(words.get("flash")).toBe("eco")
    expect(words.get("pro")).toBe("sport")
    expect(words.get("deepseek")).toBeUndefined()
  })

  it("drops ambiguous tokens that span distinct model IDs", () => {
    const words = deriveModeWords({
      eco: "openai/gpt-5-nano",
      sport: "openai/gpt-5",
    })
    expect(words.get("gpt")).toBeUndefined()
    expect(words.get("nano")).toBe("eco")
  })

  it("drops version-like and non-alphabetic tokens", () => {
    const words = deriveModeWords({ sport: "deepseek/deepseek-v4-pro-2.5" })
    expect(words.get("deepseek")).toBe("sport")
    expect(words.get("pro")).toBe("sport")
    expect(words.get("v4")).toBeUndefined()
    expect(words.get("2")).toBeUndefined()
    expect(words.get("5")).toBeUndefined()
  })

  it("explicit aliases win over built-in and derived words, ignoring invalid values", () => {
    const words = deriveModeWords(
      { sport: "deepseek/deepseek-v4-pro" },
      { fast: "sport", pro: "normal", junk: "turbo" },
    )
    expect(words.get("fast")).toBe("sport")
    expect(words.get("pro")).toBe("normal")
    expect(words.get("junk")).toBeUndefined()
  })

  it("normalizes explicit alias keys and values case-insensitively", () => {
    const words = deriveModeWords({}, { Turbo: "SPORT" })
    expect(words.get("turbo")).toBe("sport")
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
