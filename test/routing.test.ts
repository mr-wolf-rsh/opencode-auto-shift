import { describe, expect, it } from "vitest"
import { normalizeConfig, type NormalizedConfig } from "../src/config.js"
import { isSameModel, parseModelSpec, routeTarget } from "../src/routing.js"

function cfg(overrides: Record<string, unknown> = {}): NormalizedConfig {
  return normalizeConfig({
    modes: {
      eco: "deepseek/deepseek-v4-flash",
      normal: "deepseek/deepseek-v4-flash",
      sport: "deepseek/deepseek-v4-pro",
    },
    ...overrides,
  })
}

describe("parseModelSpec", () => {
  it("parses a provider/model specifier", () => {
    expect(parseModelSpec("deepseek/deepseek-v4-pro")).toEqual({
      providerID: "deepseek",
      modelID: "deepseek-v4-pro",
    })
  })

  it("returns undefined for malformed specifiers", () => {
    expect(parseModelSpec("")).toBeUndefined()
    expect(parseModelSpec("no-slash")).toBeUndefined()
    expect(parseModelSpec("/missing-provider")).toBeUndefined()
    expect(parseModelSpec("provider/")).toBeUndefined()
    expect(parseModelSpec(undefined as unknown as string)).toBeUndefined()
  })
})

describe("routeTarget", () => {
  it("maps each tier to its configured model slot", () => {
    const config = cfg()
    expect(routeTarget("eco", config)).toBe("deepseek/deepseek-v4-flash")
    expect(routeTarget("normal", config)).toBe("deepseek/deepseek-v4-flash")
    expect(routeTarget("sport", config)).toBe("deepseek/deepseek-v4-pro")
  })

  it("falls back normal -> eco when no normal slot is configured", () => {
    const config = cfg({ modes: { eco: "openai/gpt-5-nano", sport: "openai/gpt-5" } })
    expect(routeTarget("normal", config)).toBe("openai/gpt-5-nano")
  })

  it("returns undefined when the tier has no configured model", () => {
    const config = cfg({ modes: { eco: "openai/gpt-5-nano" } })
    expect(routeTarget("sport", config)).toBeUndefined()
  })
})

describe("isSameModel", () => {
  it("detects when the message already runs on the routed model", () => {
    expect(
      isSameModel({ providerID: "deepseek", modelID: "deepseek-v4-pro" }, {
        providerID: "deepseek",
        modelID: "deepseek-v4-pro",
      }),
    ).toBe(true)
    expect(
      isSameModel({ providerID: "deepseek", modelID: "deepseek-v4-flash" }, {
        providerID: "deepseek",
        modelID: "deepseek-v4-pro",
      }),
    ).toBe(false)
    expect(isSameModel(undefined, { providerID: "deepseek", modelID: "deepseek-v4-pro" })).toBe(false)
  })
})
