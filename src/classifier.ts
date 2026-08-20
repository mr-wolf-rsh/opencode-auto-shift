/**
 * Message complexity classifier.
 *
 * Drive modes (model tiers): eco (routine), normal (middle), sport (heavy).
 * Pure and dependency-free so it can be unit-tested in isolation. The default
 * heuristic is zero-cost: no extra LLM call, just a keyword/phrase scan. An
 * optional LLM classifier can be wired in behind a config flag for users who
 * want higher precision and are willing to pay for one tiny classification
 * call per message.
 */

export type Complexity = "eco" | "normal" | "sport"

export interface Classification {
  complexity: Complexity
  /** Keywords/phrases that matched. Empty for LLM classifications. */
  matched: string[]
  source: "heuristic" | "llm"
}

/**
 * Default sport-mode escalation keywords. A single-word keyword matches its
 * stem (e.g. "debug" also matches "debugging"); a phrase (contains a space or
 * non-alphanumeric char) matches as a case-insensitive substring.
 */
export const DEFAULT_SPORT_KEYWORDS: string[] = [
  // architecture / design
  "architecture",
  "design",
  "refactor",
  "restructure",
  "migrate",
  "migration",
  "rebuild",
  "rewrite",
  "rearchitect",
  // correctness / analysis
  "debug",
  "algorithm",
  "schema",
  "security",
  "performance",
  "optimize",
  "review",
  "spec",
  "specification",
  "plan",
  // multi-file / non-trivial signals
  "non-trivial",
  "non trivial",
  "2+ files",
  "multiple files",
  "from scratch",
  // explanation / investigation intents
  "why does",
  "how does",
  "how should",
  "explain how",
]

/**
 * Optional normal-mode keywords. Empty by default, so the classifier is an
 * eco/sport two-mode split unless you configure a `normal` tier.
 */
export const DEFAULT_NORMAL_KEYWORDS: string[] = []

const WORD_RE = /^[a-z0-9]+$/

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function matchKeywords(msg: string, keywords: string[]): string[] {
  const matched: string[] = []
  for (const keyword of keywords) {
    const kw = keyword.toLowerCase().trim()
    if (!kw) continue

    if (WORD_RE.test(kw)) {
      // Stem match: word boundary + keyword + optional trailing word chars.
      const re = new RegExp(`\\b${escapeRegExp(kw)}[a-z0-9]*`, "i")
      if (re.test(msg)) matched.push(keyword)
    } else {
      // Phrase: plain case-insensitive substring.
      if (msg.includes(kw)) matched.push(keyword)
    }
  }
  return matched
}

/**
 * Classify a message with the heuristic keyword scanner.
 *
 * Drive modes are checked in priority order: sport first, then normal, then
 * the eco default. Provide `normalKeywords` to enable a middle tier (useful
 * for three-model setups such as Claude Haiku / Sonnet / Opus).
 *
 * @param text           Raw user message text.
 * @param sportKeywords  Keyword list for sport mode. Defaults to {@link DEFAULT_SPORT_KEYWORDS}.
 * @param normalKeywords Keyword list for the optional normal tier. Defaults to empty.
 */
export function classifyHeuristic(
  text: string,
  sportKeywords: string[] = DEFAULT_SPORT_KEYWORDS,
  normalKeywords: string[] = DEFAULT_NORMAL_KEYWORDS,
): Classification {
  const msg = text.toLowerCase().trim()

  const sportMatched = matchKeywords(msg, sportKeywords)
  if (sportMatched.length > 0) {
    return { complexity: "sport", matched: sportMatched, source: "heuristic" }
  }

  const normalMatched = matchKeywords(msg, normalKeywords)
  if (normalMatched.length > 0) {
    return { complexity: "normal", matched: normalMatched, source: "heuristic" }
  }

  return { complexity: "eco", matched: [], source: "heuristic" }
}

/**
 * Configuration for the optional LLM classifier. Uses any OpenAI-compatible
 * chat/completions endpoint.
 */
export interface LLMClassifierConfig {
  /** Base URL without the trailing path, e.g. `https://api.openai.com/v1`. */
  baseUrl: string
  /** Small/cheap model to run the classification, e.g. `gpt-4o-mini`. */
  model: string
  /** Literal API key. Prefer `apiKeyEnv`. */
  apiKey?: string
  /** Name of an environment variable that holds the API key. */
  apiKeyEnv?: string
}

/**
 * Classify via a tiny LLM call. Returns `null` (and defers to the heuristic)
 * when the classifier is misconfigured, the endpoint fails, or the reply is
 * not parseable — the router must never crash or block on classification.
 *
 * The LLM classifier is binary (sport/eco); the `normal` tier is
 * heuristic-only.
 */
export async function classifyLLM(text: string, config: LLMClassifierConfig): Promise<Classification | null> {
  const apiKey = config.apiKey ?? (config.apiKeyEnv ? process.env[config.apiKeyEnv] : undefined)
  if (!apiKey) return null

  try {
    const res = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 5,
        messages: [
          {
            role: "system",
            content:
              'Classify the user request as "sport" or "eco". ' +
              "Sport: architecture, design, refactoring, debugging, algorithms, " +
              "migrations, security, performance, multi-file or non-trivial work. " +
              "Eco: small, single-purpose edits or questions. " +
              "Reply with exactly one word: sport or eco.",
          },
          { role: "user", content: text },
        ],
      }),
    })

    if (!res.ok) return null

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const reply = (data.choices?.[0]?.message?.content ?? "").toLowerCase().trim()

    if (reply.includes("sport")) {
      return { complexity: "sport", matched: [], source: "llm" }
    }
    if (reply.includes("eco")) {
      return { complexity: "eco", matched: [], source: "llm" }
    }
    return null
  } catch {
    return null
  }
}
