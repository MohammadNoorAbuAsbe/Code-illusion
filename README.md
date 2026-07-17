# Code Illusion De-tangler

Renders AI/agent-written code as a side-by-side **De-cluttered View** of semantic micro-cards.

## How it works

Agents annotate code blocks with inline `@illusion` comments describing each block's intent. The extension parses the code using tree-sitter, extracts blocks (functions, classes, loops, try blocks), and displays them as collapsible cards with a **narrative tree** showing the call graph.

```
// @illusion: fetch_profile -> queries API -> caches result
async function fetchProfile(id: string) {
  const data = await api.get(`/users/${id}`);
  return cache.set(id, data);
}
```

## Features

- **De-cluttered View** — side-by-side: original code left, semantic cards right
- **@illusion annotations** — inline comments describing block intent in `A -> B -> C` flow notation
- **Narrative trees** — call graph composed into a human-readable execution story
- **Execution Flow** — file-level story chaining entry points
- **Coverage Checking** — missing annotations reported in Problems panel
- **Scaffold** — auto-insert `@illusion` placeholders for unannotated blocks
- **Init Agent Rules** — copies annotation standard into project (AGENTS.md, CLAUDE.md, .cursor/rules)
- **Live Refresh** — debounced re-analysis on editor/text changes
- **Multi-language** — JS, TS, React, Python, Java, C#, Go, Rust (tree-sitter grammars)

## Commands

| Command | Keybinding | Description |
|---------|-----------|-------------|
| Code Illusion: Open De-cluttered View | `Ctrl+Alt+D` / `Cmd+Alt+D` | Open side-by-side card view |
| Code Illusion: Check Coverage | — | List unannotated blocks in Problems |
| Code Illusion: Scaffold Annotations | — | Insert @illusion placeholders |
| Code Illusion: Init Agent Rules | — | Copy annotation standards to project |

## Requirements

- VS Code ^1.85.0
- Node.js 18+ (for development)

## Installation

```bash
npm install
npm run build
```

Then press `F5` in VS Code to launch the Extension Development Host.

## Agent Annotation Standard

See [AGENTS.md](AGENTS.md) for the full specification.

Every logical block must have an `@illusion` comment:
```
@illusion: <intent> -> <action> -> <result>
```

## Building

```bash
npm run build      # Build extension, webview, and test bundle
npm run typecheck  # TypeScript type checking
npm run lint       # ESLint
npm run test       # Run core analysis tests
```

## License

MIT
