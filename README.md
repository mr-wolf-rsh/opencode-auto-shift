# opencode-auto-shift

An automatic gearbox for your [OpenCode](https://opencode.ai) models.

Every message gets the right **drive mode** and the right **gear** — automatically. Routine work
stays in **eco**, heavy lifting shifts into **sport**, and a **normal** middle tier slots in when
you have three models. The shifting is done by a zero-cost keyword heuristic: no extra LLM call, no
system-prompt overhead, just the right reasoning effort dialed in before the model starts. When you
need more power, you can switch drive modes (`switch_mode` tool) or pull into the pits to swap MCP
servers (`mcp_toggle`).

Built for OpenCode today; the classifier core is agent-agnostic and portable — see
[Backlog](#backlog) for Claude Code, Cursor, Windsurf, OpenClaw, Grok, and more.

## The metaphor

Drive modes are **model tiers** — each mode is a concrete model. Gears are the **reasoning effort**
the model spends on a message. The automatic gearbox (the heuristic classifier) shifts the gears
for you; the drive-mode selector lets you pick the model yourself.

| In a car | In opencode-auto-shift |
|---|---|
| Drive modes: eco / normal / sport | Model tiers: fast / medium / heavy — each mode maps to whatever model you configure (e.g. haiku / sonnet / opus, or flash / pro) |
| Gears | Reasoning effort — passed through verbatim; the values your provider accepts (e.g. DeepSeek: low/high/max; Claude: low/medium/high/xhigh/max) |
| Automatic transmission | The heuristic classifier — shifts gears (effort) for you, every message |
| Drive-mode selector / paddle | The `switch_mode` tool — change drive mode (model) on demand |
| Pit stop | `mcp_toggle` — swap MCP servers at runtime |

## Why this exists

I built my first serious project with the OpenCode agent. The result was great — but the token
counter wasn't. Even with optimizers, prompt tweaks, and every performance trick I could find, a
huge share of the spend went to messages that simply didn't need a strong model: a one-line edit,
a "run the tests", a rename.

The pattern was hard to miss. Most of my messages were city driving — routine, low-stakes, done in
seconds. A small minority — architecture, debugging, migrations, anything touching multiple files —
were genuinely hard and deserved full compute. The rest were burning capable-model tokens for
busywork, like cruising the highway in first gear.

So I went looking for a tool that would route each message to the right model automatically. There
wasn't one. So I built it.

That's the core idea behind opencode-auto-shift: classify every message, shift the reasoning effort
(and, where OpenCode allows, the model itself) so cheap work stays cheap and hard work gets the
capability it needs. The default classifier is a zero-cost keyword heuristic on purpose — spending
tokens to save tokens would defeat the entire point.

---

## What it does

| Capability | Mechanism | Automatic? | Cost |
|---|---|---|---|
| Gear shifting (reasoning effort) | `chat.params` hook → `options.reasoningEffort` | ✅ per message | zero |
| MCP enable/disable | `client.mcp.connect` / `disconnect` tool | 🔧 on demand | zero |
| Drive-mode switch (model) | `switch_mode` tool → `client.session.prompt` model override | 🔧 on demand | zero |
| LLM classifier | optional tiny classification call | ✅ when enabled | ~1 small call/message |

### Why model routing is not fully automatic

OpenCode's plugin API has **no hook that changes the model of an in-flight message**. Verified
against the OpenCode source (`packages/plugin/src/index.ts`, `packages/opencode/src/session/llm/request.ts`):

- `chat.message` and `chat.params` both receive the *already-resolved* model as read-only input;
  neither hook's output has a `model` field.
- `session.update` only accepts `title`/`metadata`/`permission`/`time`.
- `config.update({ model })` changes the *global default* model, not the current session/turn.

The only per-prompt model override is `client.session.prompt({ body: { model } })`, which works
when the plugin *owns* the prompt — not for transparently re-routing a message you type in the TUI
(the relay would duplicate the turn).

**What this means in practice:**

- **Gears (reasoning effort)** are shifted automatically and instantly (the core zero-cost win).
- **Model changes** are either manual (`F2` cycles recent models, `/model` picks one) or driven by
  the `switch_mode` tool when a model decides a task needs a different drive mode.

If OpenCode later exposes a model-selection hook, this plugin will adopt it for fully automatic
model routing. Until then, the heuristic classifier + gear shifting get you most of the value
without any per-message model swap.

---

## Install

1. Add the plugin to your `opencode.json`:

   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "plugin": [
       ["opencode-auto-shift", {
         "eco": "provider/eco-model",
         "normal": "provider/normal-model",
         "sport": "provider/sport-model",
         "gears": { "sport": "high", "eco": "low" }
       }]
     ]
   }
   ```

   For example, a DeepSeek Flash/Pro split (fast and medium both run on Flash; effort
   differentiates them — see [gear values](#gear-values-are-provider-specific--examples)):

   ```json
   ["opencode-auto-shift", {
     "eco": "deepseek/deepseek-v4-flash",
     "normal": "deepseek/deepseek-v4-flash",
     "sport": "deepseek/deepseek-v4-pro",
     "gears": { "eco": "low", "normal": "high", "sport": "max" }
   }]
   ```

   The same shape works for **any** provider — a three-model Claude setup:

   ```json
   ["opencode-auto-shift", {
     "eco": "anthropic/claude-haiku-4-5",
     "normal": "anthropic/claude-sonnet-4-5",
     "sport": "anthropic/claude-opus-4-6",
     "gears": { "eco": "low", "normal": "medium", "sport": "max" }
   }]
   ```

   Two-model OpenAI and Google setups:

   ```json
   ["opencode-auto-shift", {
     "eco": "openai/gpt-5-nano",
     "sport": "openai/gpt-5",
     "gears": { "eco": "low", "sport": "high" }
   }]
   ```

   ```json
   ["opencode-auto-shift", {
     "eco": "google/gemini-2.5-flash",
     "sport": "google/gemini-2.5-pro",
     "gears": { "eco": "low", "sport": "high" }
   }]
   ```

   These are just examples — the plugin never constrains which models or providers you run.

2. Restart OpenCode (or run `/plugin` to load it). The plugin is a no-op until configured with a
   `gears` block and/or used via its tools.

---

## Configuration

```jsonc
["opencode-auto-shift", {
  // Master kill switch. false = complete no-op.
  "enabled": true,

  // Drive modes = model tiers. Each mode is a concrete model (provider/model).
  // `sport` is used by the `switch_mode` tool; `eco` documents your baseline
  // (the plugin lowers effort on whatever model is active).
  "eco": "provider/eco-model",
  "normal": "provider/normal-model", // optional — 3-mode setups only
  "sport": "provider/sport-model",

  // Extra sport-mode escalation keywords (merged with the built-in defaults).
  "sport_keywords": ["architecture", "refactor", "custom-signal"],

  // Optional normal-mode keywords. When non-empty, the classifier gains a
  // "normal" tier between eco and sport — for three-model setups such as
  // Claude Haiku / Sonnet / Opus. Empty by default (two modes).
  "normal_keywords": ["feature", "refine", "write tests"],

  // Optional LLM classifier (off by default — see cost note below).
  "use_llm_classifier": false,
  "llm_classifier": {
    "baseUrl": "https://your-provider.example/v1", // any OpenAI-compatible endpoint
    "model": "your-small-model",
    "apiKeyEnv": "YOUR_API_KEY_ENV"
  },

  // Gear (reasoning-effort) routing. Set to false to disable entirely.
  // Gear values are provider-specific — see "Provider effort levels" below.
  "gears": {
    "enabled": true,
    "sport": "high",
    "normal": "medium",
    "eco": "low",
    // Optional: override the options key used (defaults to a built-in
    // per-provider map, e.g. `reasoningEffort` for OpenAI-compatible providers).
    "key": "reasoningEffort"
  },

  // Log routing decisions to stderr.
  "debug": false
}]
```

### Gear values are provider-specific — examples

The plugin is model- and provider-agnostic: gear values are **passed through verbatim** to the
active provider, never validated or rewritten. Pick values your provider supports. The table below
is illustrative, not a contract — check your provider's docs:

| Provider | Example effort levels |
|---|---|
| DeepSeek (thinking mode) | `low`, `high`, `max` — see [DeepSeek effort control](https://api-docs.deepseek.com/guides/thinking_mode/#thinking-mode-toggle-and-effort-control) |
| Claude / Anthropic | `low`, `medium`, `high`, `xhigh`, `max` — see [Claude effort levels](https://platform.claude.com/docs/en/build-with-claude/effort#effort-levels) |

The built-in defaults (`low` / `medium` / `high`) are generic vocabulary that Claude accepts. A
provider like DeepSeek has no `medium` — for a 3-mode DeepSeek setup use `"eco": "low"`,
`"normal": "high"`, `"sport": "max"`.

### Built-in sport-mode keywords

`architecture, design, refactor, restructure, migrate, migration, rebuild, rewrite, rearchitect,
debug, algorithm, schema, security, performance, optimize, review, spec, specification, plan,
non-trivial, "non trivial", "2+ files", "multiple files", "from scratch", "why does", "how does",
"how should", "explain how"`

Single-word keywords match their stem (`debug` → `debugging`, `refactor` → `refactoring`). Phrase
keywords match as case-insensitive substrings. Add or remove entries via `sport_keywords` to tune
the heuristic for your workflow.

There is no built-in `normal` keyword list — it starts empty. Provide your own via
`normal_keywords` to opt into three tiers.

---

## How shifting decides

1. The user message text is extracted from the incoming message.
2. If `use_llm_classifier` is on and configured, a tiny model call classifies it as
   `sport`/`eco`; if that call fails or is unavailable, the heuristic runs instead.
3. Otherwise the heuristic scans for escalation keywords, in priority order: **sport** first,
   then **normal** (only when `normal_keywords` is configured), then **eco** by default.
4. The result maps to reasoning effort via `gears`:
   - `sport` → `gears.sport` (default `"high"`)
   - `normal` → `gears.normal` (default `"medium"`)
   - `eco` → `gears.eco` (default `"low"`)

The effort value is injected only when the active model is **reasoning-capable** and its provider
uses a known `reasoningEffort` key (all OpenAI-compatible providers, and several others). This
mirrors the same `options` path OpenCode's own variant computation uses.

### Cost tradeoff of the LLM classifier

`use_llm_classifier: false` (default) costs **nothing** — the heuristic is pure string matching.
Enabling it makes one small classification call per message (typically a few tokens on a cheap
model). It buys higher precision on ambiguous inputs at a tiny per-message cost. For most routing
decisions the keyword heuristic is sufficient.

---

## MCP note

The `enabled` flag on an MCP server in `opencode.json` is **startup-only**. To toggle a server at
runtime, the plugin exposes the `mcp_toggle` tool:

```
mcp_toggle(name="my-server", action="connect")
mcp_toggle(name="my-server", action="disconnect")
```

Alternatively, flip the config flag and restart:

```jsonc
"mcp": { "my-server": { "enabled": false, "type": "local", "command": ["..."] } }
```

---

## Limitations

- **No automatic per-message model swap** — see "Why model routing is not fully automatic" above.
- **Gear routing is opt-out, not opt-in**: if the plugin is installed and `gears.enabled` is
  not set to `false`, it overrides the user's selected reasoning variant for reasoning-capable
  models. Set `"gears": false` if you only want the tools.
- **Provider-specific effort keys**: only OpenAI-compatible reasoning providers are mapped by
  default. Override with `gears.key` for other providers, or extend the map in `src/effort.ts`.
- **Heuristic false positives/negatives**: keyword matching is cheap, not perfect. Tune
  `sport_keywords` or enable the LLM classifier for higher precision.
- **`switch_mode`/`mcp_toggle` are agent-facing tools**, not user-facing slash commands — they are
  invoked by the model (or via an agent that calls them), not typed by you directly.
- **The LLM classifier is binary** (`sport`/`eco`); the `normal` tier is heuristic-only.

---

## Backlog

Ideas for the future — not implemented yet.

- **Agent-agnostic support** — the classifier (`src/classifier.ts`) is already dependency-free
  and portable. A future version could extract it into a shared core package with thin per-agent
  adapters — Claude Code, Cursor, Windsurf, OpenClaw, Grok, or any agent with an extension API —
  so the same routing logic works across agents. Each adapter would plug into that agent's own
  extension API, so capabilities would vary per agent.
- **Fully automatic model routing** — adopt a model-selection hook if OpenCode ever exposes one,
  removing the current manual (`F2` / `/model`) or relay (`switch_mode` tool) model-switch step.

---

## Development

```bash
npm install
npm test          # unit tests for the classifier + config
npm run typecheck # tsc --noEmit
```

## Author

* **Renzo S.** — [mr-wolf-rsh](https://github.com/mr-wolf-rsh/)

## Contributing

All sorts of suggestions and pull requests are welcome.

## License

[MIT](./LICENSE)
