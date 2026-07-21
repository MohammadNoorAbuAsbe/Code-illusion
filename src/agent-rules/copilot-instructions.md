# GitHub Copilot — Code Illusion Agent Annotation Standard

This project uses the **Code Illusion De-tangler** VS Code extension. It shows a side-by-side
"De-cluttered View" of code: original on the left, collapsed semantic micro-cards on the right. The
cards are written by **you (the coding agent)**, not by a heuristic.

## Mandatory rule

Place an inline `@illusion` comment directly above every function, method, class, `try` block, and
significant loop you add or edit:

```
@illusion: <human-readable summary of what this block does>
```

- Describe **intent** in plain verbs / data flow: `fetch -> transform -> save`.
- One line, short. Comment sits directly above the block.

Language styles: `// @illusion:` (JS/TS/Java/C#/Go/Rust), `# @illusion:` (Python), `<!-- @illusion: -->` (HTML).

## When to annotate

1. **Adding code** — annotate every new block.
2. **Editing code** — update the annotation if behavior changed.
3. **Touching existing code** — if a block lacks `@illusion`, add one. Use
   `Code Illusion: Scaffold Annotations` / `Check Coverage` to find gaps, then fill in real wording.
   Never commit `<TODO ...>` placeholders.
4. **Never delete** an annotation unless the block is deleted too.

## Helper commands

- `Code Illusion: Open De-cluttered View` (Ctrl+Alt+D / Cmd+Alt+D), `Open Project Story`, `Check Coverage`, `Scaffold Annotations`, `Init Agent Rules` (use `(Overwrite)` to refresh existing files).

## Headless usage (CLI & MCP)

The editor-free analysis engine also runs from the CLI or an MCP server (`npm run build` first).

**CLI (`code-illusion`)** — subcommands `check`, `story`, `narrative`, `analyze`, `scaffold`; flags
`--json`, `--depth N` (1–6), `--write` (scaffold only). `<path>` is a file, directory, or glob:

```bash
code-illusion check "src/**/*.ts"
code-illusion story ./src
code-illusion scaffold ./src --write
```

**CLI (`code-illusion`)** — subcommands `check`, `story`, `narrative`, `analyze`, `scaffold`, `generate`, `hook`, `install`, `uninstall`, `list`, `serve`; flags
`--json`, `--depth N` (1–6), `--write` (scaffold only), `--out DIR` (generate only), `--platform NAME` (install/uninstall), `--force` (install):

```bash
code-illusion check "src/**/*.ts"
code-illusion story ./src
code-illusion scaffold ./src --write
code-illusion generate ./src
code-illusion install --platform cursor
code-illusion uninstall
code-illusion list
code-illusion serve
```

**MCP server (`code-illusion-mcp`)** — register over stdio with any MCP client (Claude Desktop,
opencode, etc.). Tools: `check_coverage`, `get_story`, `get_narrative`, `scaffold_missing`, `generate_artifacts` (each takes
`file` / `directory` / `pattern`):

```json
{ "mcpServers": { "code-illusion": { "command": "node", "args": ["dist/mcp-server.js"] } } }
```

Full spec, examples, and per-language syntax: see `AGENTS.md` / `README.md`.
