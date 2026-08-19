# opencode-model-router

Automatic model + reasoning-effort routing for [OpenCode](https://opencode.ai) — built for a
DeepSeek Flash (routine) / Pro (complex) setup.

Zero cost by default: the classifier is a keyword heuristic with **no extra LLM call**. It only
spends tokens if you explicitly opt into the LLM classifier.

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
         "default": "deepseek/deepseek-v4-flash",
         "complex": "deepseek/deepseek-v4-pro",
         "variant": { "complex": "high", "routine": "low" }
       }]
     ]
   }
   ```

2. Restart OpenCode (or run `/plugin` to load it). The plugin is a no-op until configured with a
   `variant` and/or used via its tools.

---

## Configuration

```jsonc
["opencode-model-router", {
  // Master kill switch. false = complete no-op.
  "enabled": true,

  // Models (provider/model). Used by the `route` tool.
  "default": "deepseek/deepseek-v4-flash",
  "complex": "deepseek/deepseek-v4-pro",

  // Extra escalation keywords (merged with the built-in defaults).
  "keywords": ["architecture", "refactor", "custom-signal"],

  // Optional LLM classifier (off by default — see cost note below).
  "use_llm_classifier": false,
  "llm_classifier": {
    "baseUrl": "https://api.deepseek.com/v1",
    "model": "deepseek-chat",
    "apiKeyEnv": "DEEPSEEK_API_KEY"
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
uses a known `reasoningEffort` key (OpenAI-compatible providers such as DeepSeek included).

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
mcp_toggle(name="fanvue", action="connect")
mcp_toggle(name="fanvue", action="disconnect")
```

Alternatively, flip the config flag and restart:

```jsonc
"mcp": { "fanvue": { "enabled": false, "type": "local", "command": ["..."] } }
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
npm test          # unit tests for the classifier
npm run typecheck # tsc --noEmit
```

## License

MIT
