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

Language styles: `// @preserve @illusion:` (JS/TS/Java/C#/Go/Rust), `# @illusion:` (Python), `<!-- @illusion: -->` (HTML).

## When to annotate

1. **Adding code** — annotate every new block.
2. **Editing code** — update the annotation if behavior changed.
3. **Touching existing code** — if a block has no `@illusion`, add one. Use
   `Code Illusion: Scaffold Annotations` / `Check Coverage` to find gaps, then fill in real wording.
   Never leave `<TODO ...>` placeholders in committed code.
4. **Never delete** an annotation unless the block is deleted too.

## Helper commands

- `Code Illusion: Open De-cluttered View` — side-by-side cards (missing => `⚠ missing` badge).
- `Code Illusion: Check Coverage` — lists unannotated blocks in Problems.
- `Code Illusion: Scaffold Annotations` — inserts `@illusion: <TODO ...>` placeholders above gaps.
- `Code Illusion: Init Agent Rules` — copies this standard into the project.

See `AGENTS.md` for full examples and per-language syntax.
