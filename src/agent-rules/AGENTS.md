# Code Illusion — Agent Annotation Standard

This project uses the **Code Illusion De-tangler** VS Code extension. It renders code as a
side-by-side "De-cluttered View": the original code on the left, and collapsed **semantic
micro-cards** on the right. The cards are produced by **you (the agent)**, not by a heuristic.

Every logical block you touch must be described by an inline `@illusion` annotation that you write.
The extension only renders what you author — it never invents card text.

## The rule (mandatory)

For **every** function, method, class, `try` block, and significant loop you add or edit, place an
inline comment immediately above it in this exact form:

```
@illusion: <human-readable summary of what this block does>
```

- The summary must describe **intent**, using plain human verbs and data flow, e.g.
  `fetch profile -> transform -> save to LocalStorage`. Prefer `A -> B -> C` flow notation.
- Keep it short (one line). This is the "optical filter" that lets humans skip the boilerplate.
- The comment must sit **directly above** the block it describes, with only blank lines between.

### Language-specific comment styles

```js
// @illusion: fetchUserProfile -> Fetches profile -> Saves to LocalStorage
async function fetchUserProfile(id) { /* ... */ }
```

```python
# @illusion: load_config -> reads env -> returns typed settings
def load_config(): ...
```

```java
// @illusion: authenticate -> validates token -> returns principal
public Principal authenticate(String token) { ... }
```

```csharp
// @illusion: hydrate_order -> queries db -> maps to DTO
public OrderDto HydrateOrder(int id) { ... }
```

```go
// @illusion: sync_ledger -> pulls remote -> writes local cache
func syncLedger() error { ... }
```

```rust
// @illusion: parse_args -> validates cli -> builds Config
fn parse_args() -> Config { ... }
```

```html
<!-- @illusion: user_card -> renders avatar + name -->
<div class="user-card"> ... </div>
```

## AI assistant startup (mandatory)

Before reading or editing any source files, check if `code-illusion-out/COVERAGE.md` exists:

- **If it does**: read it first — it tells you which blocks are unannotated, which are the most-cited god nodes, and where the execution flow is broken. Use this to prioritize annotation work.
- **If it doesn't**: run `code-illusion generate <src-dir>` (e.g. `code-illusion generate ./src`) to create it. Then read the generated `code-illusion-out/COVERAGE.md`.

This one file compresses the annotation health of the entire project into a page you can digest in seconds.

## When you MUST annotate

1. **Adding code** — annotate every new block before finishing the task.
2. **Editing code** — if you change a block's behavior, update its `@illusion` text to match.
3. **Touching existing code** — if you open/modify a file and find a block with **no**
   `@illusion` comment, you MUST add one. Run the `Code Illusion: Scaffold Annotations` command
   (or the `Check Coverage` command) to find gaps, then fill in the real wording. Never leave a
   `@illusion: <TODO ...>` placeholder in committed code.
4. **Never delete** an `@illusion` annotation unless you are also deleting the block it describes.

## How the tool helps you (and CI)

- `Code Illusion: Open De-cluttered View` — side-by-side cards; missing annotations show a
  `⚠ missing @illusion` badge. (Keybinding: `Ctrl+Alt+D` / `Cmd+Alt+D`.)
- `Code Illusion: Open Project Story` — opens a unified, cross-file execution-flow story of the
  whole project (resolves imports to real functions across modules).
- `Code Illusion: Check Coverage` — lists every unannotated block in the Problems panel. Use it to
  verify 100% coverage before considering a task done.
- `Code Illusion: Scaffold Annotations` — inserts `@illusion: <TODO ...>` placeholders above gaps so
  you can fill them in. (Placeholders are a starting point, not a final answer.)
- `Code Illusion: Init Agent Rules` — copies this standard into a project (`AGENTS.md`, etc.).
  Use `Code Illusion: Init Agent Rules (Overwrite)` to refresh files that already exist.

## Headless usage (CLI & MCP)

The analysis engine is editor-free, so agents and CI can run checks, narratives, and stories
without VS Code — via the **CLI** or the **MCP server** (both shipped in `dist/` after `npm run build`).

### CLI (`code-illusion`, `npm run cli`)

`<path>` may be a file, a directory (recursively scanned), or a glob (e.g. `src/**/*.ts`). When more
than one file resolves, the tool builds one unified cross-file call graph.

```bash
code-illusion check src/foo.ts                 # coverage: annotated/total + missing blocks
code-illusion check "src/**/*.ts" --json       # same, as JSON
code-illusion story ./src                       # unified execution-flow narrative
code-illusion narrative src/foo.ts              # per-block call-graph narrative trees (JSON)
code-illusion analyze src/foo.ts --json         # full analysis (JSON)
code-illusion scaffold ./src --write            # insert @illusion placeholders across all files
code-illusion generate ./src                    # write code-illusion-out/ artifacts (COVERAGE.md, STORY.md, coverage.json)
code-illusion generate ./src --out docs/ci      # write to a custom directory
code-illusion hook                              # install pre-commit hook to auto-generate artifacts
code-illusion install                           # register @illusion agent rules with AI assistants
code-illusion install --platform cursor         # install rules for a specific platform
code-illusion uninstall                         # remove installed agent rules
code-illusion uninstall --purge                 # also delete code-illusion-out/
code-illusion list                              # show installed platforms
code-illusion serve                             # start MCP server
```

Subcommands: `check`, `story`, `narrative`, `analyze`, `scaffold`, `generate`, `hook`, `install`, `uninstall`, `list`, `serve`.
Options: `--json` (machine-readable), `--depth N` (narrative depth 1–6), `--write` (scaffold only), `--out DIR` (generate only), `--platform NAME` (install/uninstall), `--force` (install), `--purge` (uninstall).

### MCP server (`code-illusion-mcp`, `npm run mcp`)

Run over stdio and register with any MCP client (Claude Desktop, opencode, etc.). It exposes four
tools, each accepting a `file`, a `directory`, or a `pattern` (glob); directory/pattern scopes return
the unified cross-file analysis.

| Tool | Purpose |
|------|---------|
| `check_coverage` | Report which blocks are missing `@illusion` annotations (+ god-node summary) |
| `get_story` | Return the file-level execution-flow narrative |
| `get_narrative` | Return each annotated block's call-graph narrative tree |
| `scaffold_missing` | Return `@illusion` placeholder snippets for missing blocks |
| `generate_artifacts` | Analyze and write `code-illusion-out/` artifacts — god nodes, surprising connections, coverage |

Example MCP client config:

```json
{
  "mcpServers": {
    "code-illusion": {
      "command": "node",
      "args": ["dist/mcp-server.js"]
    }
  }
}
```

## Narrative style — writing for the call graph

The extension now composes a **"story"** by chaining `@illusion` annotations across function calls.
When you write annotations, describe **what the function does at the story level**, not just its
own logic. This lets the engine build a human-readable execution flow for the whole file.

### How narrative composition works

1. For each block, the engine detects which **other functions** it calls (via tree-sitter AST walk).
2. It maps calls to the callee's `@illusion` annotation.
3. It recursively composes a narrative: `functionA label. Calls functionB (functionB label). Calls functionC (functionC label).`
4. Cycle detection prevents infinite recursion (e.g., A -> B -> A shows "(cycle back)").

### Implications for your annotations

**Good — callee annotations describe intent for callers to reuse:**

```
// @illusion: loadConfig -> reads env -> validates schema -> returns settings
function loadConfig() { ... }

// @illusion: fetchData -> builds URL -> sends GET -> parses JSON
function fetchData(url) { ... }

// @illusion: main -> orchestrates startup -> calls loadConfig + fetchData
function main() {
  const cfg = loadConfig();
  const data = fetchData(cfg.apiUrl);
}
```

The narrative for `main` becomes:
> `main orchestrates startup -> calls loadConfig + fetchData. Calls loadConfig (reads env -> validates schema -> returns settings). Calls fetchData (builds URL -> sends GET -> parses JSON).`

And the file-level execution flow story reads as a complete sentence.

### The "story rule"

When writing `@illusion` text, imagine how it will read when inlined into the caller's narrative.
Prefer **verb-focused, intent-describing phrases** (`reads config -> validates schema`) over
passive descriptions (`this function reads configuration`).

## Examples of good cards

```
// @illusion: debounce -> throttles calls -> returns wrapped fn
// @illusion: retry_with_backoff -> attempts N times -> exponential delay
// @illusion: validate_request -> checks schema -> throws on mismatch
// @illusion: cache_lookup -> checks memory -> falls back to redis
```

Bad (do not do this — it just restates the code):

```
// @illusion: function that does a loop and sets a variable
```

Good:

```
// @illusion: aggregate_metrics -> groups by day -> computes rolling average
```
