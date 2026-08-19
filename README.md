# opencode-model-router

Automatic model + reasoning-effort routing for [OpenCode](https://opencode.ai).

Route your work across a cheap "routine" model and a capable "complex" model — DeepSeek Flash /
Pro, GPT-5-nano / GPT-5, Claude Haiku / Sonnet, or any pair you run. The plugin classifies every
message and dials the reasoning effort up or down to match, with zero extra LLM cost.

## Why this exists

I built my first serious project with the OpenCode agent. The result was great — but the token
counter wasn't. Even with optimizers, prompt tweaks, and every performance trick I could find, a
huge share of the spend went to messages that simply didn't need a strong model: a one-line edit,
a "run the tests", a rename.

The pattern was hard to miss. Most of my messages were routine. A small minority — architecture,
debugging, migrations, anything touching multiple files — were genuinely hard and deserved real
compute. The rest were burning capable-model tokens for busywork.

So I went looking for a tool that would route each message to the right model automatically.
There wasn't one. So I built it.

That's the core idea behind opencode-model-router: classify every message, route reasoning effort
(and, where OpenCode allows, the model itself) so cheap work stays cheap and hard work gets the
capability it needs. The default classifier is a zero-cost keyword heuristic on purpose — spending
tokens to save tokens would defeat the entire point.

---

## What it does

| Capability | Mechanism | Automatic? | Cost |
|---|---|---|---|
| Reasoning-effort routing | `chat.params` hook → `options.reasoningEffort` | ✅ per message | zero |
| MCP enable/disable | `client.mcp.connect` / `disconnect` tool | 🔧 on demand | zero |
| Model escalation relay | `route` tool → `client.session.prompt` model override | 🔧 on demand | zero |
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

- **Reasoning effort** is routed automatically and instantly (the core zero-cost win).
- **Model changes** are either manual (`F2` cycles recent models, `/model` picks one) or driven by
  the `route` tool when a model decides a task needs escalation.

If OpenCode later exposes a model-selection hook, this plugin will adopt it for fully automatic
model routing. Until then, the heuristic classifier + effort routing get you most of the value
without any per-message model swap.

---

## Install

1. Add the plugin to your `opencode.json`:

   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "plugin": [
       ["opencode-model-router", {
         "default": "provider/routine-model",
         "complex": "provider/complex-model",
         "variant": { "complex": "high", "routine": "low" }
       }]
     ]
   }
   ```

   For example, a DeepSeek Flash/Pro split:

   ```json
   ["opencode-model-router", {
     "default": "deepseek/deepseek-v4-flash",
     "complex": "deepseek/deepseek-v4-pro",
     "variant": { "complex": "high", "routine": "low" }
   }]
   ```

2. Restart OpenCode (or run `/plugin` to load it). The plugin is a no-op until configured with a
   `variant` and/or used via its tools.

---

## Configuration

```jsonc
["opencode-model-router", {
  // Master kill switch. false = complete no-op.
  "enabled": true,

  // Your routine and complex models (provider/model). `complex` is used by the
  // `route` tool; `default` documents your baseline (the plugin lowers effort on
  // whatever model is active).
  "default": "provider/routine-model",
  "complex": "provider/complex-model",

  // Extra escalation keywords (merged with the built-in defaults).
  "keywords": ["architecture", "refactor", "custom-signal"],

  // Optional LLM classifier (off by default — see cost note below).
  "use_llm_classifier": false,
  "llm_classifier": {
    "baseUrl": "https://your-provider.example/v1", // any OpenAI-compatible endpoint
    "model": "your-small-model",
    "apiKeyEnv": "YOUR_API_KEY_ENV"
  },

  // Reasoning-effort routing. Set to false to disable entirely.
  "variant": {
    "enabled": true,
    "complex": "high",
    "routine": "low",
    // Optional: override the options key used (defaults to a built-in
    // per-provider map, e.g. `reasoningEffort` for OpenAI-compatible providers).
    "key": "reasoningEffort"
  },

  // Log routing decisions to stderr.
  "debug": false
}]
```

### Built-in escalation keywords

`architecture, design, refactor, restructure, migrate, migration, rebuild, rewrite, rearchitect,
debug, algorithm, schema, security, performance, optimize, review, spec, specification, plan,
non-trivial, "non trivial", "2+ files", "multiple files", "from scratch", "why does", "how does",
"how should", "explain how"`

Single-word keywords match their stem (`debug` → `debugging`, `refactor` → `refactoring`). Phrase
keywords match as case-insensitive substrings. Add or remove entries via `keywords` to tune the
heuristic for your workflow.

---

## How routing decides

1. The user message text is extracted from the incoming message.
2. If `use_llm_classifier` is on and configured, a tiny model call classifies it as
   `complex`/`routine`; if that call fails or is unavailable, the heuristic runs instead.
3. Otherwise the heuristic scans for escalation keywords.
4. The result maps to reasoning effort via `variant`:
   - `complex` → `variant.complex` (default `"high"`)
   - `routine` → `variant.routine` (default `"low"`)

The effort value is injected only when the active model is **reasoning-capable** and its provider
uses a known `reasoningEffort` key (all OpenAI-compatible providers, and several others).

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
- **Effort routing is opt-out, not opt-in**: if the plugin is installed and `variant.enabled` is
  not set to `false`, it overrides the user's selected reasoning variant for reasoning-capable
  models. Set `"variant": false` if you only want the tools.
- **Provider-specific effort keys**: only OpenAI-compatible reasoning providers are mapped by
  default. Override with `variant.key` for other providers, or extend the map in `src/effort.ts`.
- **Heuristic false positives/negatives**: keyword matching is cheap, not perfect. Tune `keywords`
  or enable the LLM classifier for higher precision.
- **`route`/`mcp_toggle` are agent-facing tools**, not user-facing slash commands — they are
  invoked by the model (or via an agent that calls them), not typed by you directly.

---

## Development

```bash
npm install
npm test          # unit tests for the classifier + config
npm run typecheck # tsc --noEmit
```

## License

MIT
