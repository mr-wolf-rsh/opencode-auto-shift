/**
 * Message complexity classifier.
 *
 * Pure and dependency-free so it can be unit-tested in isolation. The default
 * heuristic is zero-cost: no extra LLM call, just a keyword/phrase scan. An
 * optional LLM classifier can be wired in behind a config flag for users who
 * want higher precision and are willing to pay for one tiny classification
 * call per message.
 */

export type Complexity = "routine" | "complex"

export interface Classification {
  complexity: Complexity
  /** Keywords/phrases that matched. Empty for LLM classifications. */
  matched: string[]
  source: "heuristic" | "llm"
}

/**
 * Default escalation keywords. A single-word keyword matches its stem
 * (e.g. "debug" also matches "debugging"); a phrase (contains a space or
 * non-alphanumeric char) matches as a case-insensitive substring.
 */
export const DEFAULT_KEYWORDS: string[] = [
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

const WORD_RE = /^[a-z0-9]+$/

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Classify a message with the heuristic keyword scanner.
 *
 * @param text       Raw user message text.
 * @param keywords   Keyword list. Defaults to {@link DEFAULT_KEYWORDS}.
 */
export function classifyHeuristic(text: string, keywords: string[] = DEFAULT_KEYWORDS): Classification {
  const msg = text.toLowerCase().trim()
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

  return {
    complexity: matched.length > 0 ? "complex" : "routine",
    matched,
    source: "heuristic",
  }
}

/**
 * Configuration for the optional LLM classifier. Uses any OpenAI-compatible
 * chat/completions endpoint (DeepSeek is OpenAI-compatible).
 */
export interface LLMClassifierConfig {
  /** Base URL without the trailing path, e.g. `https://api.deepseek.com/v1`. */
  baseUrl: string
  /** Small/cheap model to run the classification, e.g. `deepseek-chat`. */
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
              'Classify the user request as "complex" or "routine". ' +
              'Complex: architecture, design, refactoring, debugging, algorithms, ' +
              'migrations, security, performance, multi-file or non-trivial work. ' +
              'Routine: small, single-purpose edits or questions. ' +
              'Reply with exactly one word: complex or routine.',
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

    if (reply.includes("complex")) {
      return { complexity: "complex", matched: [], source: "llm" }
    }
    if (reply.includes("routine")) {
      return { complexity: "routine", matched: [], source: "llm" }
    }
    return null
  } catch {
    return null
  }
}
