# opencode-auto-shift

An automatic gearbox for your [OpenCode](https://opencode.ai) models.

Every message gets the right **drive mode** and the right **gear** — automatically. Routine work
stays in **eco**, heavy lifting shifts into **sport**, and a **normal** middle tier slots in when
you have three models. The shifting is done by a zero-cost keyword heuristic: no extra LLM call, no
system-prompt overhead, just the right reasoning effort dialed in before the model starts. When you
need more power you can switch drive modes (`switch_mode`), force a gear (`set_gear`), or pull into
the pits to swap MCP servers (`mcp_toggle`).

Built for OpenCode today; the classifier core is agent-agnostic and portable — see
[Backlog](#backlog) for Claude Code, Cursor, Windsurf, OpenClaw, Grok, and more.

## The metaphor

Drive modes are **model tiers** — each mode is a concrete model. Gears are the **reasoning effort**
the model spends on a message. The automatic gearbox (the heuristic classifier) shifts the gears
for you; the drive-mode selector lets you pick the model yourself.

| In a car | In opencode-auto-shift |
|---|---|
| Drive modes: eco / normal / sport | Model tiers: fast / medium / heavy — each mode maps to whatever model you configure (e.g. haiku / sonnet / opus, or flash / pro) |
| Gears: 1st, 2nd, 3rd… | Numbered effort positions — each maps to a reasoning-effort string your provider accepts (e.g. DeepSeek: low/high/max; Claude: low/medium/high/xhigh/max) |
| Automatic transmission | The heuristic classifier + `shifts` program — picks a gear (effort) for you, every message |
| Manual/paddle mode | The `set_gear` tool — force a gear on demand, or resume automatic shifting |
| Drive-mode selector | The `switch_mode` tool — change drive mode (model) on demand |
| Pit stop | `mcp_toggle` — swap MCP servers at runtime |

Modes and gears are **independent axes**: any model can run at any gear. The classifier
output (eco/normal/sport), the gear table, and the shift program are all configured
separately — you can run your sport model at 1st gear if you want to (not recommended,
but fully allowed).

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
| Gear shifting (reasoning effort) | `chat.params` hook → `options.reasoningEffort`, via the `shifts` program | ✅ per message | zero |
| Manual gear override | `set_gear` tool → forces a gear until cleared | 🔧 on demand | zero |
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
         "modes": {
           "eco": "provider/eco-model",
           "normal": "provider/normal-model",
           "sport": "provider/sport-model"
         },
         "gears": { "1": "low", "2": "high", "3": "max" },
         "shifts": { "eco": 1, "normal": 2, "sport": 3 }
       }]
     ]
   }
   ```

   The three blocks are independent: `modes` map drive modes to models, `gears` map
   numbered positions to effort strings, and `shifts` map classifier output to a gear
   position. Any model can run at any gear.

   For example, a DeepSeek Flash/Pro split (eco and normal both run on Flash; effort
   differentiates them — see [gear values](#gear-values-are-provider-specific--examples)):

   ```json
   ["opencode-auto-shift", {
     "modes": {
       "eco": "deepseek/deepseek-v4-flash",
       "normal": "deepseek/deepseek-v4-flash",
       "sport": "deepseek/deepseek-v4-pro"
     },
     "gears": { "1": "low", "2": "high", "3": "max" },
     "shifts": { "eco": 1, "normal": 2, "sport": 3 }
   }]
   ```

   The same shape works for **any** provider — a three-model Claude setup:

   ```json
   ["opencode-auto-shift", {
     "modes": {
       "eco": "anthropic/claude-haiku-4-5",
       "normal": "anthropic/claude-sonnet-4-5",
       "sport": "anthropic/claude-opus-4-6"
     },
     "gears": { "1": "low", "2": "medium", "3": "high" },
     "shifts": { "eco": 1, "normal": 2, "sport": 3 }
   }]
   ```

   Two-model OpenAI and Google setups (drop the `normal` mode and third gear):

   ```json
   ["opencode-auto-shift", {
     "modes": { "eco": "openai/gpt-5-nano", "sport": "openai/gpt-5" },
     "gears": { "1": "low", "2": "high" },
     "shifts": { "eco": 1, "sport": 2 }
   }]
   ```

   ```json
   ["opencode-auto-shift", {
     "modes": { "eco": "google/gemini-2.5-flash", "sport": "google/gemini-2.5-pro" },
     "gears": { "1": "low", "2": "high" },
     "shifts": { "eco": 1, "sport": 2 }
   }]
   ```

   These are just examples — the plugin never constrains which models or providers you run.

2. Restart OpenCode (or run `/plugin` to load it). The plugin injects effort only when a
   `gears` table is configured and/or you use its tools.

---

## Configuration

```jsonc
["opencode-auto-shift", {
  // Master kill switch. false = complete no-op.
  "enabled": true,

  // Drive modes = model tiers. Each mode is a concrete model (provider/model).
  // Used by the `switch_mode` tool. Independent of gears — any model can run
  // at any gear.
  "modes": {
    "eco": "provider/eco-model",
    "normal": "provider/normal-model", // optional — 3-mode setups only
    "sport": "provider/sport-model"
  },

  // Numbered gears = reasoning-effort positions. Each maps to a provider
  // effort string, passed through verbatim. No default table — effort values
  // are provider-specific. `key` overrides the options key used to set effort
  // (defaults to a built-in per-provider map). Set the whole block to `false`
  // to disable gear routing entirely.
  "gears": {
    "1": "low",
    "2": "medium",
    "3": "high",
    "key": "reasoningEffort"
  },

  // The automatic shift program: classifier complexity -> gear position.
  // The KEYS (eco/normal/sport) are the classifier's output tiers. Each VALUE
  // is a gear NUMBER — an index into the `gears` table above, NOT the effort
  // itself. The effort that actually gets injected is whatever `gears[number]`
  // holds. Any tier may point at any gear. Defaults to { eco: 1, normal: 2,
  // sport: 3 } — but only for tiers you leave out; yours always wins.
  // Example: set "sport": 2 to run sport at gear 2 instead of 3, skipping the
  // max-effort gear to save cost.
  "shifts": { "eco": 1, "normal": 2, "sport": 3 },

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

There is no universal default gear table because the vocabulary differs per provider. A
provider like DeepSeek has no `medium` — so a three-gear DeepSeek table is
`{ "1": "low", "2": "high", "3": "max" }`, while Claude can use
`{ "1": "low", "2": "medium", "3": "high" }`. Configure the gear table (and `shifts`) to
match the models you actually run.

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
4. Unless a gear was manually forced via `set_gear`, the classifier tier maps to a gear
   position via the `shifts` program (defaults: `eco` → 1, `normal` → 2, `sport` → 3).
5. The gear position maps to an effort string via the `gears` table. If the position has no
   entry, no effort is injected for that message.

The effort value is injected only when the active model is **reasoning-capable** and its provider
uses a known `reasoningEffort` key (all OpenAI-compatible providers, and several others). This
mirrors the same `options` path OpenCode's own variant computation uses.

### How `shifts` + `gears` resolve (worked example)

The classifier tier is **not** the effort, and the gear number is **not** the effort either.
A message resolves in two hops: tier → gear (via `shifts`), then gear → effort (via `gears`).

Given:

```json
"gears":  { "1": "low", "2": "high", "3": "max" },
"shifts": { "eco": 1, "normal": 2, "sport": 3 }
```

| Classifier tier | `shifts` → gear | `gears[gear]` → effort |
|---|---|---|
| `eco` | 1 | `low` |
| `normal` | 2 | `high` |
| `sport` | 3 | `max` |

To run sport cheaper — skipping the max-effort gear — point it at gear 2 instead:

```json
"shifts": { "eco": 1, "normal": 2, "sport": 2 }
```

Now `sport` resolves to gear 2 → `high`, not `max`. The classifier still says "sport"; only the
gear it engages changed. The two maps are independent: edit `gears` to redefine what a gear
*means* (e.g. `"2": "medium"`), or edit `shifts` to redefine which gear a tier *engages* — neither
edit touches the other, and neither forces sport onto max.

### Manual gear override

`set_gear` moves the gearbox into manual mode: it forces a gear for all subsequent messages
until you clear it. This is independent of `switch_mode` (which changes the model) — you can
force a gear, switch drive mode, or both, in any combination.

```
set_gear(gear=3)      // force gear 3 (max effort) for subsequent messages
set_gear(auto=true)   // back to automatic shifting
```

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
- **Gear routing needs a `gears` table**: with no configured gear table, the plugin injects no
  effort (there is no universal default, since effort vocabulary is provider-specific). Set
  `"gears": false` to disable gear routing explicitly if you only want the tools.
- **Provider-specific effort keys**: the built-in map (`src/effort.ts`) resolves `reasoningEffort`
  for OpenAI, Anthropic, DeepSeek, xAI/Grok, Groq, Mistral, Perplexity, OpenRouter, and the
  OpenAI-compatible providers. Providers with a *different* reasoning mechanism (Google/Vertex
  uses `thinkingConfig.thinkingLevel`; Amazon Bedrock uses `reasoningConfig`) are not mapped —
  override with `gears.key` for those, or extend the map in `src/effort.ts`.
- **`set_gear` is sticky, in-memory**: a forced gear applies for the rest of the session until
  cleared (`set_gear(auto=true)`); it does not persist across restarts.
- **Heuristic false positives/negatives**: keyword matching is cheap, not perfect. Tune
  `sport_keywords` or enable the LLM classifier for higher precision.
- **`switch_mode`/`set_gear`/`mcp_toggle` are agent-facing tools**, not user-facing slash commands —
  they are invoked by the model (or via an agent that calls them), not typed by you directly.
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
