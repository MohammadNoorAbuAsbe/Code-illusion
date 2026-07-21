# Code Illusion — Annotation Health

Generated: 2026-07-21T09:07:02.585Z

## Summary

- **Files analyzed**: 23
- **Total blocks**: 172
- **Annotated**: 161/172 (**94%**)
- **Entry points**: 25/25 (**100%**)

**11 unannotated block(s) remain.**

## God Nodes (most-cited blocks)

These blocks are called by the most other blocks. Annotating them has the highest impact on narrative quality.

| Rank | Block | File | Called By | Annotation |
|------|-------|------|-----------|------------|
| 1 | `getLanguageConfig` | `src\core\languages.ts` | 4 | ✅ get_language_config -> looks up language -> returns config o |
| 2 | `escapeHtml` | `src\webview\ui\main.ts` | 4 | ✅ escape_html -> escapes text -> prevents html injection |
| 3 | `getActiveEditor` | `src\commands\util.ts` | 3 | ✅ get_active_editor -> gets editor or throws |
| 4 | `analyzeEditor` | `src\commands\util.ts` | 3 | ✅ analyze_editor -> reads document -> forwards narrativeDepth  |
| 5 | `analyzeDocument` | `src\core\annotations.ts` | 3 | ✅ analyze_document -> parses/extracts single file -> builds ca |
| 6 | `extractCallNames` | `src\core\calls.ts` | 3 | ✅ extract_call_names -> walks node -> lists called identifiers |
| 7 | `icon` | `src\webview\ui\main.ts` | 3 | ✅ icon -> looks up svg path -> wraps named icon in svg markup |
| 8 | `render` | `src\webview\ui\main.ts` | 3 | ✅ render -> rebuilds filter UI + grouped/animated card list fr |
| 9 | `isBlock` | `src\core\blocks.ts` | 2 | ✅ is_block -> true if node is an extractable function/class/lo |
| 10 | `precedingComments` | `src\core\annotations.ts` | 2 | ✅ preceding_comments -> climbs parents -> collects @illusion c |
| 11 | `extractLabel` | `src\core\annotations.ts` | 2 | ✅ extract_label -> scans comments -> returns the @illusion sum |
| 12 | `parse` | `src\core\parser.ts` | 2 | ✅ parse -> parses text with cached grammar+parser -> returns t |
| 13 | `extractBlocks` | `src\core\blocks.ts` | 2 | ✅ extract_blocks -> walks tree -> collects all extractable blo |
| 14 | `analyzeFileCore` | `src\core\annotations.ts` | 2 | ✅ analyze_file_core -> parses/extracts a single file -> return |
| 15 | `resolveExternalLabels` | `src\core\crossfile.ts` | 2 | ✅ resolve_external_labels -> resolves imported names -> their  |
| 16 | `composeNarratives` | `src\core\narrative.ts` | 2 | ✅ compose_narratives -> renders a narrative tree for every lab |
| 17 | `buildExecutionFlow` | `src\core\narrative.ts` | 2 | ✅ build_execution_flow -> joins entry-point narratives into a  |
| 18 | `visit` | `src\core\blocks.ts` | 2 | ✅ visit -> recurses tree nodes -> records extractable blocks |
| 19 | `visit` | `src\core\calls.ts` | 2 | ✅ visit -> walks call nodes -> records called identifiers (sto |
| 20 | `isCallableKind` | `src\core\calls.ts` | 2 | ✅ is_callable_kind -> true for node kinds that can be direct c |

## Surprising Connections (cross-module edges)

These edges connect unrelated modules — they may indicate architectural coupling worth reviewing.

- `src\commands\checkCoverage.ts:checkCoverageCommand` → `src\commands\util.ts:getActiveEditor` ✅
- `src\commands\checkCoverage.ts:checkCoverageCommand` → `src\commands\util.ts:analyzeEditor` ✅
- `src\commands\openProjectStory.ts:openProjectStoryCommand` → `src\core\project.ts:analyzeProject` ✅
- `src\commands\openProjectStory.ts:openProjectStoryCommand` → `src\webview\projectStory.ts:showProjectStory` ✅
- `src\commands\openView.ts:openViewCommand` → `src\commands\util.ts:getActiveEditor` ✅
- `src\commands\openView.ts:openViewCommand` → `src\commands\util.ts:analyzeEditor` ✅
- `src\commands\openView.ts:openViewCommand` → `src\webview\panel.ts:showDeclutteredView` ✅
- `src\commands\scaffold.ts:scaffoldCommand` → `src\commands\util.ts:getActiveEditor` ✅
- `src\commands\scaffold.ts:scaffoldCommand` → `src\commands\util.ts:analyzeEditor` ✅
- `src\commands\scaffold.ts:scaffoldCommand` → `src\core\scaffold.ts:scaffoldProposals` ✅
- `src\commands\util.ts:analyzeEditor` → `src\core\annotations.ts:analyzeDocument` ✅
- `src\core\annotations.ts:(anonymous)` → `src\core\blocks.ts:isBlock` ✅
- `src\core\annotations.ts:analyzeFileCore` → `src\core\languages.ts:getLanguageConfig` ✅
- `src\core\annotations.ts:(anonymous)` → `src\core\parser.ts:parse` ✅
- `src\core\annotations.ts:(anonymous)` → `src\core\blocks.ts:extractBlocks` ✅
- `src\core\annotations.ts:(anonymous)` → `src\core\crossfile.ts:extractImports` ✅
- `src\core\annotations.ts:analyzeDocument` → `src\core\crossfile.ts:resolveExternalLabels` ✅
- `src\core\annotations.ts:analyzeDocument` → `src\core\languages.ts:getLanguageConfig` ✅
- `src\core\annotations.ts:analyzeDocument` → `src\core\calls.ts:buildCallGraph` ✅
- `src\core\annotations.ts:analyzeDocument` → `src\core\narrative.ts:composeNarratives` ✅

## Coverage by Directory

| Directory | Annotated | Total | % |
|-----------|-----------|-------|---|
| `src\webview` | 21 | 21 | 100% |
| `src\webview\ui` | 23 | 23 | 100% |
| `src\commands` | 11 | 12 | 92% |
| `src\core` | 106 | 116 | 91% |
