import { describe, expect, it } from "vitest"
import { parseDirective, StickyOverrides } from "../src/directive.js"
import type { Complexity } from "../src/classifier.js"

function words(): Map<string, Complexity> {
  return new Map<string, Complexity>([
    ["eco", "eco"],
    ["fast", "eco"],
    ["lite", "eco"],
    ["normal", "normal"],
    ["balanced", "normal"],
    ["sport", "sport"],
    ["heavy", "sport"],
    ["pro", "sport"],
  ])
}

describe("parseDirective", () => {
  const modeWords = words()

  it("parses the natural-language mode form", () => {
    expect(parseDirective("go sport", modeWords)).toEqual({ mode: "sport", sticky: false, clear: false })
    expect(parseDirective("go eco", modeWords)).toEqual({ mode: "eco", sticky: false, clear: false })
  })

  it("parses the sigil mode form and resolves aliases", () => {
    expect(parseDirective("!sport", modeWords)).toEqual({ mode: "sport", sticky: false, clear: false })
    expect(parseDirective("!pro", modeWords)).toEqual({ mode: "sport", sticky: false, clear: false })
  })

  it("parses the model-suffixed mode form", () => {
    expect(parseDirective("use the heavy model", modeWords)).toEqual({ mode: "sport", sticky: false, clear: false })
    expect(parseDirective("switch to normal", modeWords)).toEqual({ mode: "normal", sticky: false, clear: false })
  })

  it("parses gear directives in both sigil and natural forms", () => {
    expect(parseDirective("!gear 3", modeWords)).toEqual({ gear: 3, sticky: false, clear: false })
    expect(parseDirective("use gear 2 do the thing", modeWords)).toEqual({ gear: 2, sticky: false, clear: false })
    expect(parseDirective("set gear 3", modeWords)).toEqual({ gear: 3, sticky: false, clear: false })
  })

  it("parses sticky mode and gear directives", () => {
    expect(parseDirective("stay on normal", modeWords)).toEqual({ mode: "normal", sticky: true, clear: false })
    expect(parseDirective("!stay sport", modeWords)).toEqual({ mode: "sport", sticky: true, clear: false })
    expect(parseDirective("!lock gear 1", modeWords)).toEqual({ gear: 1, sticky: true, clear: false })
    expect(parseDirective("lock gear 2", modeWords)).toEqual({ gear: 2, sticky: true, clear: false })
  })

  it("parses clear directives", () => {
    expect(parseDirective("back to auto", modeWords)).toEqual({ sticky: false, clear: true })
    expect(parseDirective("!auto", modeWords)).toEqual({ sticky: false, clear: true })
    expect(parseDirective("resume auto", modeWords)).toEqual({ sticky: false, clear: true })
    expect(parseDirective("go auto", modeWords)).toEqual({ sticky: false, clear: true })
  })

  it("is case-insensitive and tolerant of leading whitespace", () => {
    expect(parseDirective("GO SPORT", modeWords)).toEqual({ mode: "sport", sticky: false, clear: false })
    expect(parseDirective("  go sport", modeWords)).toEqual({ mode: "sport", sticky: false, clear: false })
  })

  it("rejects non-anchored (mid-message) words", () => {
    expect(parseDirective("refactor auth and go sport", modeWords)).toBeUndefined()
    expect(parseDirective("sport is fun", modeWords)).toBeUndefined()
  })

  it("returns undefined for unknown words and non-directives", () => {
    expect(parseDirective("hello there", modeWords)).toBeUndefined()
    expect(parseDirective("!unknownword", modeWords)).toBeUndefined()
    expect(parseDirective("go bogus", modeWords)).toBeUndefined()
    expect(parseDirective("", modeWords)).toBeUndefined()
  })
})

describe("StickyOverrides", () => {
  it("tick before any apply is a no-op", () => {
    const o = new StickyOverrides()
    expect(o.tick()).toBe(false)
    expect(o.active).toBe(false)
  })

  it("starts inactive and applies mode/gear", () => {
    const o = new StickyOverrides()
    expect(o.active).toBe(false)
    o.apply({ mode: "sport" }, 3)
    expect(o.active).toBe(true)
    expect(o.mode).toBe("sport")
    expect(o.gear).toBeNull()
  })

  it("merges mode and gear across separate applies", () => {
    const o = new StickyOverrides()
    o.apply({ gear: 2 }, 0)
    o.apply({ mode: "eco" }, 5)
    expect(o.mode).toBe("eco")
    expect(o.gear).toBe(2)
  })

  it("uses the override for `turns` messages, then clears on the next", () => {
    const o = new StickyOverrides()
    o.apply({ mode: "sport" }, 3)
    expect(o.tick()).toBe(true)
    expect(o.mode).toBe("sport")
    expect(o.tick()).toBe(true)
    expect(o.mode).toBe("sport")
    expect(o.tick()).toBe(true)
    expect(o.mode).toBe("sport")
    expect(o.tick()).toBe(false)
    expect(o.mode).toBeNull()
    expect(o.active).toBe(false)
  })

  it("keeps values visible through the tick that hits zero (for chat.params)", () => {
    const o = new StickyOverrides()
    o.apply({ gear: 2 }, 1)
    expect(o.tick()).toBe(true)
    expect(o.gear).toBe(2)
    expect(o.tick()).toBe(false)
    expect(o.gear).toBeNull()
  })

  it("never auto-expires unlimited overrides", () => {
    const o = new StickyOverrides()
    o.apply({ gear: 3 }, 0)
    for (let i = 0; i < 100; i++) o.tick()
    expect(o.active).toBe(true)
    expect(o.gear).toBe(3)
  })

  it("clear resets both axes", () => {
    const o = new StickyOverrides()
    o.apply({ mode: "normal", gear: 2 }, 0)
    o.clear()
    expect(o.active).toBe(false)
    expect(o.mode).toBeNull()
    expect(o.gear).toBeNull()
  })
})
