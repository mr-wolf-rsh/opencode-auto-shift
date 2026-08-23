import { afterEach, describe, expect, it, vi } from "vitest"
import { PendingSwitchRegistry } from "../src/relay.js"

const SPEC = { providerID: "deepseek", modelID: "deepseek-v4-pro" }

describe("PendingSwitchRegistry", () => {
  afterEach(() => vi.restoreAllMocks())

  it("stores and consumes a pending switch exactly once", () => {
    const reg = new PendingSwitchRegistry()
    reg.set("s1", SPEC)
    expect(reg.take("s1")).toEqual(SPEC)
    expect(reg.take("s1")).toBeUndefined()
  })

  it("returns undefined for a session with no pending switch", () => {
    const reg = new PendingSwitchRegistry()
    expect(reg.take("s1")).toBeUndefined()
  })

  it("keeps fresh entries inside the TTL window", () => {
    const now = Date.now()
    vi.spyOn(Date, "now").mockReturnValue(now)
    const reg = new PendingSwitchRegistry(60_000)
    reg.set("s1", SPEC)
    vi.spyOn(Date, "now").mockReturnValue(now + 59_000)
    expect(reg.take("s1")).toEqual(SPEC)
  })

  it("drops expired entries instead of returning them", () => {
    const now = Date.now()
    vi.spyOn(Date, "now").mockReturnValue(now)
    const reg = new PendingSwitchRegistry(60_000)
    reg.set("s1", SPEC)
    vi.spyOn(Date, "now").mockReturnValue(now + 61_000)
    expect(reg.take("s1")).toBeUndefined()
    // And the stale entry is removed, not deferred.
    expect(reg.take("s1")).toBeUndefined()
  })

  it("clear removes a pending switch", () => {
    const reg = new PendingSwitchRegistry()
    reg.set("s1", SPEC)
    reg.clear("s1")
    expect(reg.take("s1")).toBeUndefined()
  })
})
