import { tool, type Plugin } from "@opencode-ai/plugin"
import {
  classifyHeuristic,
  classifyLLM,
  DEFAULT_SPORT_KEYWORDS,
  DEFAULT_NORMAL_KEYWORDS,
  type Classification,
  type Complexity,
  type LLMClassifierConfig,
} from "./classifier.js"
import {
  normalizeConfig,
  type NormalizedConfig,
  type AutoShiftConfig,
  type GearsConfig,
} from "./config.js"
import { effortKeyFor } from "./effort.js"

/**
 * opencode-auto-shift plugin entry — an automatic gearbox for your models.
 *
 * Drive modes (model tiers): eco (fast), normal (medium), sport (heavy) — each
 * mode maps to a concrete model (e.g. haiku / sonnet / opus, or flash / pro).
 * Gears (reasoning effort) are shifted automatically per message via the
 * `chat.params` hook: sport messages get high effort, eco messages low (and,
 * when configured, normal messages medium).
 *
 * What it does on demand (via tools exposed to the model):
 *   - `switch_mode`: re-send a prompt on a different drive mode (eco/normal/
 *     sport) — a per-prompt model override relay. opencode's plugin API has no
 *     hook to change the model of an in-flight message, so model changes are
 *     either manual (F2 / /model) or driven through this relay tool.
 *   - `mcp_toggle`: connect/disconnect an MCP server at runtime.
 */
const server: Plugin = async (input, options) => {
  const cfg = normalizeConfig(options)
  const { client } = input

  async function classify(text: string): Promise<Classification> {
    if (cfg.useLLMClassifier && cfg.llmClassifier) {
      const result = await classifyLLM(text, cfg.llmClassifier)
      if (result) return result
    }
    return classifyHeuristic(text, cfg.sportKeywords, cfg.normalKeywords)
  }

  function log(message: string) {
    if (cfg.debug) console.error(`[opencode-auto-shift] ${message}`)
  }

  return {
    "chat.params": async (hookInput, output) => {
      if (!cfg.enabled || !cfg.gears.enabled) return

      // Only reasoning-capable models accept a reasoning-effort override.
      if (hookInput.model.capabilities.reasoning !== true) return

      const key = cfg.gears.key ?? effortKeyFor(hookInput.model.api.npm)
      if (!key) return

      const text = extractText(hookInput.message)
      if (!text) return

      const result = await classify(text)
      const effort =
        result.complexity === "sport"
          ? cfg.gears.sport
          : result.complexity === "normal"
            ? cfg.gears.normal
            : cfg.gears.eco
      if (!effort) return

      log(`${result.complexity} mode -> ${effort} effort (matched: ${result.matched.join(", ") || "none"})`)
      output.options[key] = effort
    },

    tool: {
      switch_mode: tool({
        description:
          "Switch drive mode: route a prompt to a different tier model by sending it as a new " +
          "message with a model override. Modes map to the configured model slots (eco / normal / " +
          "sport). Defaults to sport (heavy escalation) when the current model is insufficient.",
        args: {
          prompt: tool.schema.string().describe("The prompt text to send to the target model."),
          mode: tool.schema
            .enum(["eco", "normal", "sport"])
            .optional()
            .describe("Drive mode (model tier) to switch to. Defaults to sport."),
          model: tool.schema
            .string()
            .optional()
            .describe("Explicit target model as 'provider/model'. Overrides `mode`."),
        },
        async execute(args, ctx) {
          const target =
            args.model ??
            (args.mode === "normal"
              ? cfg.normalModel
              : args.mode === "eco"
                ? cfg.ecoModel
                : cfg.sportModel)
          if (!target) {
            return {
              title: "switch_mode",
              output:
                "No target model configured. Pass a `model` argument or set the matching model slot (eco/normal/sport) in the plugin options.",
            }
          }
          const slash = target.indexOf("/")
          const providerID = slash >= 0 ? target.slice(0, slash) : ""
          const modelID = slash >= 0 ? target.slice(slash + 1) : ""
          if (!providerID || !modelID) {
            return {
              title: "switch_mode",
              output: `Invalid model specifier "${target}" (expected provider/model)`,
            }
          }
          try {
            await client.session.prompt({
              path: { id: ctx.sessionID },
              body: {
                model: { providerID, modelID },
                parts: [{ type: "text", text: args.prompt }],
              },
            })
            return { title: "switch_mode", output: `Switched to ${target}` }
          } catch (error) {
            return { title: "switch_mode", output: `Failed to switch to ${target}: ${String(error)}` }
          }
        },
      }),

      mcp_toggle: tool({
        description:
          "Connect or disconnect an MCP server at runtime. The `enabled` flag in opencode config only " +
          "applies at startup; this tool toggles the live server connection on demand.",
        args: {
          name: tool.schema.string().describe("MCP server name (as configured in opencode.json)."),
          action: tool.schema.enum(["connect", "disconnect"]).describe("Connect or disconnect the server."),
        },
        async execute(args) {
          try {
            if (args.action === "connect") await client.mcp.connect({ path: { name: args.name } })
            else await client.mcp.disconnect({ path: { name: args.name } })
            return { title: "mcp", output: `${args.action}ed MCP server "${args.name}"` }
          } catch (error) {
            return { title: "mcp", output: `Failed to ${args.action} MCP server "${args.name}": ${String(error)}` }
          }
        },
      }),
    },
  }
}

/**
 * Extract user text from whatever shape opencode hands the plugin. At runtime
 * the `message` passed to `chat.params` is a user message record that carries a
 * `parts` array of `{ type, text }` entries; we also fall back to string /
 * `summary.body` shapes defensively.
 */
function extractText(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    return value.map(extractText).filter(Boolean).join("\n")
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    if (typeof obj.text === "string") return obj.text
    if (Array.isArray(obj.parts)) return extractText(obj.parts)
    if (obj.summary && typeof obj.summary === "object") {
      const body = (obj.summary as Record<string, unknown>).body
      if (typeof body === "string") return body
    }
  }
  return ""
}

export {
  classifyHeuristic,
  classifyLLM,
  DEFAULT_SPORT_KEYWORDS,
  DEFAULT_NORMAL_KEYWORDS,
  normalizeConfig,
  effortKeyFor,
}
export type {
  Classification,
  Complexity,
  LLMClassifierConfig,
  NormalizedConfig,
  AutoShiftConfig,
  GearsConfig,
}

export default {
  id: "opencode-auto-shift",
  server,
}
