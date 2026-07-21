# CLAUDE.md — Code Illusion Agent Annotation Standard

(Shared project standard. Also available as `AGENTS.md`.)

This project uses the **Code Illusion De-tangler** VS Code extension, which renders code as a
side-by-side "De-cluttered View": original code on the left, collapsed semantic micro-cards on the
right. The cards are written by **you (the agent)**, never by a heuristic.

## Mandatory rule

Place an inline `@illusion` comment directly above every function, method, class, `try` block, and
significant loop you add or edit:

```
@illusion: <human-readable summary of what this block does>
```

- Describe **intent** in plain verbs / data flow: `fetch -> transform -> save`.
- One line. Keep it short.
- Comment sits directly above the block.

Language styles: `// @illusion:` (JS/TS/Java/C#/Go/Rust), `# @illusion:` (Python), `<!-- @illusion: -->` (HTML).

## AI assistant startup (mandatory)

Before reading or editing source files, check if `code-illusion-out/COVERAGE.md` exists:

- **If it does**: read it first — it shows annotation health, god nodes, and execution flow gaps.
- **If it doesn't**: run `code-illusion generate ./src` to create it, then read `code-illusion-out/COVERAGE.md`.

## When to annotate

1. **Adding code** — annotate every new block.
2. **Editing code** — update the annotation if behavior changed.
3. **Touching existing code** — if a block has no `@illusion`, add one. Use
   `Code Illusion: Scaffold Annotations` / `Check Coverage` to find gaps, then fill in real wording.
   Never leave `<TODO ...>` placeholders in committed code.
4. **Never delete** an annotation unless the block is deleted too.

## Helper commands

- `Code Illusion: Open De-cluttered View` — side-by-side cards (missing => `⚠ missing` badge). Keybinding: `Ctrl+Alt+D` / `Cmd+Alt+D`.
- `Code Illusion: Open Project Story` — unified, cross-file execution-flow story of the whole project.
- `Code Illusion: Check Coverage` — lists unannotated blocks in Problems.
- `Code Illusion: Scaffold Annotations` — inserts `@illusion: <TODO ...>` placeholders above gaps.
- `Code Illusion: Init Agent Rules` — copies this standard into the project (use the `(Overwrite)` variant to refresh existing files).

## Headless usage (CLI & MCP)

The editor-free analysis engine also runs from the CLI or an MCP server (`npm run build` first).

 **CLI (`code-illusion`)** — subcommands `check`, `story`, `narrative`, `analyze`, `scaffold`, `generate`, `hook`; flags
`--json`, `--depth N` (1–6), `--write` (scaffold only), `--out DIR` (generate only). `<path>` is a file, directory, or glob:

```bash
code-illusion check "src/**/*.ts"
code-illusion story ./src
code-illusion scaffold ./src --write
```

 **MCP server (`code-illusion-mcp`)** — register over stdio with any MCP client (Claude Desktop,
opencode, etc.). Tools: `check_coverage`, `get_story`, `get_narrative`, `scaffold_missing`, `generate_artifacts`
(each takes `file` / `directory` / `pattern`):

```json
{ "mcpServers": { "code-illusion": { "command": "node", "args": ["dist/mcp-server.js"] } } }
```

See `AGENTS.md` / `README.md` for full examples, per-language syntax, and the narrative style.
