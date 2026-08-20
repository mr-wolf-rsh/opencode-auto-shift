import { describe, expect, it } from "vitest"
import { classifyHeuristic, DEFAULT_SPORT_KEYWORDS } from "../src/classifier.js"

describe("classifyHeuristic", () => {
  it("routes eco messages to eco", () => {
    expect(classifyHeuristic("what does git status do").complexity).toBe("eco")
    expect(classifyHeuristic("add a comment to this function").complexity).toBe("eco")
    expect(classifyHeuristic("run the tests please").complexity).toBe("eco")
    expect(classifyHeuristic("").complexity).toBe("eco")
  })

  it("escalates single-word sport keywords", () => {
    expect(classifyHeuristic("debug this flaky test").complexity).toBe("sport")
    expect(classifyHeuristic("refactor the auth module").complexity).toBe("sport")
    expect(classifyHeuristic("design a schema for user profiles").complexity).toBe("sport")
    expect(classifyHeuristic("there is a security issue here").complexity).toBe("sport")
    expect(classifyHeuristic("optimize this query").complexity).toBe("sport")
  })

  it("escalates phrase keywords", () => {
    expect(classifyHeuristic("why does this migration fail?").complexity).toBe("sport")
    expect(classifyHeuristic("how does the session store work?").complexity).toBe("sport")
    expect(classifyHeuristic("this touches 2+ files").complexity).toBe("sport")
    expect(classifyHeuristic("implement it from scratch").complexity).toBe("sport")
  })

  it("matches word stems (debug -> debugging)", () => {
    expect(classifyHeuristic("help debugging a crash").complexity).toBe("sport")
    expect(classifyHeuristic("start refactoring the API").complexity).toBe("sport")
  })

  it("is case insensitive", () => {
    expect(classifyHeuristic("REFACTOR this now").complexity).toBe("sport")
  })

  it("reports the matched keywords", () => {
    const result = classifyHeuristic("please refactor the debug logic")
    expect(result.complexity).toBe("sport")
    expect(result.matched).toContain("refactor")
    expect(result.matched).toContain("debug")
    expect(result.source).toBe("heuristic")
  })

  it("uses word boundaries so 'run' does not match 'running'", () => {
    // No "run" keyword by default; guard against accidental substring matches.
    expect(classifyHeuristic("the running total", ["run"]).complexity).toBe("sport")
  })

  it("supports custom keywords", () => {
    expect(classifyHeuristic("sprinkle confetti", ["confetti"]).complexity).toBe("sport")
    expect(classifyHeuristic("do the thing", ["confetti"]).complexity).toBe("eco")
  })

  it("supports an optional normal tier", () => {
    const result = classifyHeuristic("deploy to staging", [], ["deploy"])
    expect(result.complexity).toBe("normal")
    expect(result.matched).toContain("deploy")
  })

  it("prioritizes sport over normal", () => {
    expect(classifyHeuristic("debug the deploy pipeline", ["debug"], ["deploy"]).complexity).toBe("sport")
  })

  it("falls back to eco when normal keywords don't match", () => {
    expect(classifyHeuristic("say hello", [], ["deploy"]).complexity).toBe("eco")
  })

  it("ships a non-empty default sport keyword list", () => {
    expect(DEFAULT_SPORT_KEYWORDS.length).toBeGreaterThan(0)
  })
})
