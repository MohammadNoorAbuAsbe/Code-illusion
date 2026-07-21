# Change Log

All notable changes to the Code Illusion De-tangler extension will be documented in this file.

## 0.2.2

- `Init Agent Rules` now has an **Overwrite** variant (`codeIllusion.initRulesForce`) that refreshes existing rule files instead of skipping them
- Agent-rule templates (`AGENTS.md`, `CLAUDE.md`, `copilot-instructions.md`, `code-illusion.mdc`) and `README.md` now document all surfaces: the `Open Project Story` command, the headless **CLI** (`check`/`story`/`narrative`/`analyze`/`scaffold`), and the **MCP server** (`check_coverage`/`get_story`/`get_narrative`/`scaffold_missing`)

## 0.2.0

- Recursive narrative tree renderer — narratives now render correctly at any `narrativeDepth` (previously truncated after 2 levels)
- New `codeIllusion.narrativeDepth` setting (1–6) to control how deep call-graph narratives and the execution-flow story descend
- Smarter regex fallback parser: faithful block/name detection, call extraction, and de-duplicated call lists for unsupported languages
- `editAnnotation` now reliably locates annotations placed directly above a block (previously missed adjacent comments)
- Call-graph extraction now includes `new Foo()` constructor calls
- Grammar parsers are cached per language for faster live refresh
- Analysis surfaces an info notice when it falls back to regex mode
- Dogfooding: every core function now carries an `@illusion` annotation (plain form; the parser still accepts the `@preserve @illusion` variant)
- Expanded core test suite (language config, block extraction, narrative recursion/depth, fallback parser)
- Headless CLI (`code-illusion check|story|narrative|analyze|scaffold`) so agents/CI can run checks without VS Code
- MCP server (`code-illusion-mcp`) exposing `check_coverage`, `get_story`, `get_narrative`, `scaffold_missing` tools
- Extracted reusable `core/scaffold` module; VS Code Scaffold command now shares it
- CI workflow: typecheck, lint, format check, build, and tests on every push/PR
- **Project-wide analysis**: the CLI and MCP tools accept a directory or glob pattern (e.g. `src/**/*.ts`); the engine builds one **unified cross-file call graph** and a single merged execution-flow story that follows imported functions across files
- Module path resolution now appends extension/index candidates, so relative imports without a file extension (e.g. `../core/annotations`) resolve correctly — cross-file narratives now recurse into the real target function instead of stopping at the boundary

## 0.1.0 (2026-07-17)

- Initial release
- Side-by-side "De-cluttered View" with original code and semantic micro-cards
- Tree-sitter based block extraction for JS/TS/React/Python/Java/C#/Go/Rust
- Regex-based fallback parser for unsupported languages
- Call graph analysis with narrative tree composition
- Execution flow story generation
- Coverage checking via Problems panel diagnostics
- Scaffold command to insert annotation placeholders
- Init Agent Rules command to propagate annotation standards
- Debounced live refresh on editor/text changes
- CSP-secured webview panel
- Agent annotation standard with `@illusion` comments
