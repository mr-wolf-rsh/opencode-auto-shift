import { describe, expect, it } from "vitest"
import { classifyHeuristic, DEFAULT_KEYWORDS } from "../src/classifier.js"

describe("classifyHeuristic", () => {
  it("routes routine messages to routine", () => {
    expect(classifyHeuristic("what does git status do").complexity).toBe("routine")
    expect(classifyHeuristic("add a comment to this function").complexity).toBe("routine")
    expect(classifyHeuristic("run the tests please").complexity).toBe("routine")
    expect(classifyHeuristic("").complexity).toBe("routine")
  })

  it("escalates single-word complex keywords", () => {
    expect(classifyHeuristic("debug this flaky test").complexity).toBe("complex")
    expect(classifyHeuristic("refactor the auth module").complexity).toBe("complex")
    expect(classifyHeuristic("design a schema for user profiles").complexity).toBe("complex")
    expect(classifyHeuristic("there is a security issue here").complexity).toBe("complex")
    expect(classifyHeuristic("optimize this query").complexity).toBe("complex")
  })

  it("escalates phrase keywords", () => {
    expect(classifyHeuristic("why does this migration fail?").complexity).toBe("complex")
    expect(classifyHeuristic("how does the session store work?").complexity).toBe("complex")
    expect(classifyHeuristic("this touches 2+ files").complexity).toBe("complex")
    expect(classifyHeuristic("implement it from scratch").complexity).toBe("complex")
  })

  it("matches word stems (debug -> debugging)", () => {
    expect(classifyHeuristic("help debugging a crash").complexity).toBe("complex")
    expect(classifyHeuristic("start refactoring the API").complexity).toBe("complex")
  })

  it("is case insensitive", () => {
    expect(classifyHeuristic("REFACTOR this now").complexity).toBe("complex")
  })

  it("reports the matched keywords", () => {
    const result = classifyHeuristic("please refactor the debug logic")
    expect(result.complexity).toBe("complex")
    expect(result.matched).toContain("refactor")
    expect(result.matched).toContain("debug")
    expect(result.source).toBe("heuristic")
  })

  it("uses word boundaries so 'run' does not match 'running'", () => {
    // No "run" keyword by default; guard against accidental substring matches.
    expect(classifyHeuristic("the running total", ["run"]).complexity).toBe("complex")
  })

  it("supports custom keywords", () => {
    expect(classifyHeuristic("sprinkle confetti", ["confetti"]).complexity).toBe("complex")
    expect(classifyHeuristic("do the thing", ["confetti"]).complexity).toBe("routine")
  })

  it("supports an optional medium tier", () => {
    const result = classifyHeuristic("deploy to staging", [], ["deploy"])
    expect(result.complexity).toBe("medium")
    expect(result.matched).toContain("deploy")
  })

  it("prioritizes complex over medium", () => {
    expect(classifyHeuristic("debug the deploy pipeline", ["debug"], ["deploy"]).complexity).toBe("complex")
  })

  it("falls back to routine when medium keywords don't match", () => {
    expect(classifyHeuristic("say hello", [], ["deploy"]).complexity).toBe("routine")
  })

  it("ships a non-empty default keyword list", () => {
    expect(DEFAULT_KEYWORDS.length).toBeGreaterThan(0)
  })
})
