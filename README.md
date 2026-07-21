# Code Illusion De-tangler

Renders AI/agent-written code as a side-by-side **De-cluttered View** of semantic micro-cards.

**Standalone CLI** (no editor required) + **optional VS Code extension**. Agents annotate blocks
with inline `@illusion` comments; the tool parses code using tree-sitter, extracts blocks
(functions, classes, loops, try blocks), and displays them as collapsible cards with a **narrative
tree** showing the call graph.

```
// @illusion: fetch_profile -> queries API -> caches result
async function fetchProfile(id: string) {
  const data = await api.get(`/users/${id}`);
  return cache.set(id, data);
}
```

## Quick start

```bash
npm install -g code-illusion-detangler   # install globally (or: npm run build && node dist/cli.js)
code-illusion check ./src                 # check @illusion coverage
code-illusion install                     # register with your AI assistant
```

Then in any AI coding assistant (Claude Code, Cursor, opencode, etc.), the agent
will annotate every block with `@illusion` comments.

## Features

- **De-cluttered View** — side-by-side: original code left, semantic cards right
- **@illusion annotations** — inline comments describing block intent in `A -> B -> C` flow notation
- **Narrative trees** — call graph composed into a human-readable execution story
- **Execution Flow** — file-level story chaining entry points
- **Coverage Checking** — missing annotations reported as actionable lists
- **Scaffold** — auto-insert `@illusion` placeholders for unannotated blocks
- **Init Agent Rules** — copies annotation standard into project (AGENTS.md, CLAUDE.md, .cursor/rules)
- **Pre-commit hook** — auto-regenerates annotation health on every commit
- **Multi-language** — JS, TS, React, Python, Java, C#, Go, Rust (tree-sitter grammars)

## CLI

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
code-illusion install --platform cursor         # install for a specific platform
code-illusion uninstall                         # remove installed agent rules
code-illusion uninstall --purge                 # also delete code-illusion-out/
code-illusion list                              # show installed platforms
code-illusion serve                             # start MCP server
```

## VS Code extension (optional)

The extension adds a webview-based De-cluttered View, Project Story panel, and live refresh
on editor changes. Install it from the VS Code Marketplace, or run from source:

```bash
npm run build
```

Then press `F5` in VS Code to launch the Extension Development Host.

### Extension commands

| Command | Keybinding | Description |
|---------|-----------|-------------|
| Code Illusion: Open De-cluttered View | `Ctrl+Alt+D` / `Cmd+Alt+D` | Open side-by-side card view |
| Code Illusion: Open Project Story | — | Open unified cross-file execution-flow story |
| Code Illusion: Check Coverage | — | List unannotated blocks in Problems |
| Code Illusion: Scaffold Annotations | — | Insert @illusion placeholders |
| Code Illusion: Init Agent Rules | — | Copy annotation standards to project |
| Code Illusion: Init Agent Rules (Overwrite) | — | Refresh existing rule files (overwrites) |

## Agent Annotation Standard

See [AGENTS.md](AGENTS.md) for the full specification.

Every logical block must have an `@illusion` comment:
```
// @illusion: <intent> -> <action> -> <result>
```

## Settings (VS Code)

| Setting | Default | Description |
|---------|---------|-------------|
| `codeIllusion.narrativeDepth` | `2` | How many call levels the narrative tree and execution-flow story descend into (1–6). |

## Building

```bash
npm run build      # Build extension, webview, test, CLI, and MCP server
npm run typecheck  # TypeScript type checking
npm run lint       # ESLint
npm run test       # Run core analysis tests
```

## MCP server

Run `node dist/mcp-server.js` over stdio and register it with any MCP client (e.g. Claude Desktop,
opencode). It exposes five tools:

| Tool | Purpose |
|------|---------|
| `check_coverage` | Report which blocks are missing `@illusion` annotations |
| `get_story` | Return the file-level execution-flow narrative |
| `get_narrative` | Return each annotated block's call-graph narrative tree |
| `scaffold_missing` | Return `@illusion` placeholder snippets for missing blocks |
| `generate_artifacts` | Analyze and write `code-illusion-out/` artifacts |

Each tool accepts a `file`, a `directory`, or a `pattern` (glob) — when a directory or pattern is
given, the result is the **unified cross-file** analysis (a single merged call graph and story).

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

## License

MIT
