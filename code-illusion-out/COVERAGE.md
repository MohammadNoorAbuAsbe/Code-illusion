# Code Illusion — Annotation Health

Generated: 2026-07-21T09:48:59.388Z

## Summary

- **Files analyzed**: 29
- **Total blocks**: 235
- **Annotated**: 191/235 (**81%**)
- **Entry points**: 29/30 (**97%**)

⚠ **Entry points have gaps — narrative flow will be broken.**

## God Nodes (most-cited blocks)

These blocks are called by the most other blocks. Annotating them has the highest impact on narrative quality.

| Rank | Block | File | Called By | Annotation |
|------|-------|------|-----------|------------|
| 1 | `allPlatforms` | `src\commands\installRules.ts` | 9 | ✅ all_platforms -> returns list of all defined platform target |
| 2 | `analyzeDocument` | `src\core\annotations.ts` | 6 | ✅ analyze_document -> parses/extracts single file -> builds ca |
| 3 | `analyzeProject` | `src\core\project.ts` | 5 | ✅ analyze_project -> analyzes every file -> builds one unified |
| 4 | `resolveDestPath` | `src\commands\installRules.ts` | 5 | ✅ resolve_dest_path -> resolves destination path relative to p |
| 5 | `fail` | `src\cli.ts` | 4 | ✅ fail -> prints error to stderr -> exits with code |
| 6 | `getDefaultOutDir` | `src\core\export.ts` | 4 | ✅ get_default_out_dir -> returns default output directory path |
| 7 | `resolveInputs` | `src\core\project.ts` | 4 | ✅ resolve_inputs -> expands files/dirs/globs -> supported file |
| 8 | `languageIdFromPath` | `src\core\languages.ts` | 4 | ✅ language_id_from_path -> maps file extension -> supported la |
| 9 | `out` | `src\cli.ts` | 4 | ⚠ MISSING |
| 10 | `getLanguageConfig` | `src\core\languages.ts` | 4 | ✅ get_language_config -> looks up language -> returns config o |
| 11 | `escapeHtml` | `src\webview\ui\main.ts` | 4 | ✅ escape_html -> escapes text -> prevents html injection |
| 12 | `scaffoldProposals` | `src\core\scaffold.ts` | 3 | ✅ scaffold_proposals -> finds unannotated blocks -> returns in |
| 13 | `getActiveEditor` | `src\commands\util.ts` | 3 | ✅ get_active_editor -> gets editor or throws |
| 14 | `analyzeEditor` | `src\commands\util.ts` | 3 | ✅ analyze_editor -> reads document -> forwards narrativeDepth  |
| 15 | `extractCallNames` | `src\core\calls.ts` | 3 | ✅ extract_call_names -> walks node -> lists called identifiers |
| 16 | `icon` | `src\webview\ui\main.ts` | 3 | ✅ icon -> looks up svg path -> wraps named icon in svg markup |
| 17 | `render` | `src\webview\ui\main.ts` | 3 | ✅ render -> rebuilds filter UI + grouped/animated card list fr |
| 18 | `installPlatform` | `src\commands\installRules.ts` | 2 | ✅ install_platform -> installs rules for one platform into pro |
| 19 | `buildArtifacts` | `src\core\export.ts` | 2 | ✅ build_artifacts -> computes all supplementary analysis -> re |
| 20 | `writeArtifacts` | `src\core\export.ts` | 2 | ✅ write_artifacts -> writes artifact files to the output direc |

## Surprising Connections (cross-module edges)

These edges connect unrelated modules — they may indicate architectural coupling worth reviewing.

- `src\cli.ts:main` → `src\commands\installHook.ts:installPrecommitHook` ✅
- `src\cli.ts:main` → `src\core\export.ts:getDefaultOutDir` ✅
- `src\cli.ts:main` → `src\commands\installRules.ts:installPlatform` ✅
- `src\cli.ts:main` → `src\commands\installRules.ts:allPlatforms` ✅
- `src\cli.ts:main` → `src\commands\uninstallRules.ts:uninstallSingle` ✅
- `src\cli.ts:main` → `src\commands\uninstallRules.ts:uninstallAll` ✅
- `src\cli.ts:main` → `src\commands\uninstallRules.ts:purgeOutDir` ✅
- `src\cli.ts:main` → `src\commands\installRules.ts:listInstalled` ✅
- `src\cli.ts:main` → `src\core\project.ts:resolveInputs` ✅
- `src\cli.ts:(anonymous)` → `src\commands\installRules.ts:allPlatforms` ✅
- `src\cli.ts:(anonymous)` → `src\commands\installRules.ts:installPlatform` ✅
- `src\cli.ts:(anonymous)` → `src\commands\installRules.ts:allPlatforms` ✅
- `src\cli.ts:runSingleFile` → `src\core\languages.ts:languageIdFromPath` ✅
- `src\cli.ts:runSingleFile` → `src\core\annotations.ts:analyzeDocument` ✅
- `src\cli.ts:runSingleFile` → `src\core\scaffold.ts:scaffoldProposals` ✅
- `src\cli.ts:runProject` → `src\core\project.ts:analyzeProject` ✅
- `src\cli.ts:runProject` → `src\core\export.ts:buildArtifacts` ✅
- `src\cli.ts:runProject` → `src\core\export.ts:writeArtifacts` ✅
- `src\cli.ts:runProject` → `src\core\export.ts:writeGitignore` ✅
- `src\cli.ts:runProject` → `src\core\export.ts:getDefaultOutDir` ✅

## Coverage by Directory

| Directory | Annotated | Total | % |
|-----------|-----------|-------|---|
| `src\webview` | 21 | 21 | 100% |
| `src\webview\ui` | 23 | 23 | 100% |
| `src\core` | 106 | 116 | 91% |
| `src\commands` | 24 | 37 | 65% |
| `src` | 17 | 38 | 45% |

## Missing Blocks (highest priority)

_Blocks that are unannotated but are called by other blocks — they break narrative trees._

- `out` in `src\cli.ts`:L294 — called by 4 block(s) (`runProject, for_in_statement`)
- `assert` in `src\test-core.ts`:L57 — called by 2 block(s) (`try_statement`)
- `runSingleFile` in `src\cli.ts`:L224 — called by 1 block(s) (`main`)
