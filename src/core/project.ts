import * as fs from 'fs';
import * as path from 'path';
import { Card, CallGraphEdge, ExternalCard, AnalysisResult } from './types';
import { analyzeFileCore, AnalyzeOptions, FileAnalysis } from './annotations';
import { extractCallNames, isCallableKind } from './calls';
import { isCallScopeBoundary } from './blocks';
import { resolveExternalLabels } from './crossfile';
import { composeNarratives, buildExecutionFlow } from './narrative';
import { languageIdFromPath, getLanguageConfig } from './languages';

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.vscode']);

export interface ProjectFileEntry {
  filePath: string;
  result: AnalysisResult;
}

export interface ProjectAnalysis {
  files: ProjectFileEntry[];
  allCards: Card[];
  edges: CallGraphEdge[];
  entryPointIds: string[];
  externalCards: Map<string, ExternalCard>;
  narratives: Map<string, string>;
  executionFlow: string;
  coverage: { total: number; annotated: number; missing: ProjectMissing[] };
}

export interface ProjectMissing {
  file: string;
  kind: string;
  name: string | null;
  startLine: number;
  endLine: number;
}

interface ResolvedFile {
  filePath: string;
  analysis: FileAnalysis;
}

// @illusion: walk_dir -> recurses directory -> collects supported files (skips node_modules/dist)
function walkDir(dir: string, out: Set<string>): void {
  // @illusion: scan_entries -> walks dir entries -> adds files / recurses subdirs
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walkDir(p, out);
    } else {
      out.add(p);
    }
  }
}

// @illusion: expand_glob -> walks from glob base -> returns matching file paths
function expandGlob(pattern: string): string[] {
  const metaIndex = pattern.search(/[*?[\]{}]/);
  let base = metaIndex >= 0 ? pattern.slice(0, pattern.lastIndexOf('/', metaIndex) + 1) : pattern;
  if (base === '' || base === pattern) base = '.';
  const regexStr =
    '^' +
    pattern
      .replace(/[.+^${}()|\\]/g, '\\$&')
      .replace(/\*\*/g, '§§')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/§§/g, '.*') +
    '$';
  const re = new RegExp(regexStr);
  const results: string[] = [];
  // @illusion: walk -> recurses dirs -> matches paths against glob
  const walk = (dir: string): void => {
    // @illusion: glob_walk -> recurses dirs -> matches relative path against glob regex
    let entries: fs.Dirent[];
    // @illusion: skip_unreadable_dir -> ignores read errors -> continues glob walk
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    // @illusion: walk_entries -> walks entries -> matches files / recurses dirs
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(p);
      } else {
        const rel = path.relative(process.cwd(), p).split(path.sep).join('/');
        if (re.test(rel)) results.push(p);
      }
    }
  };
  walk(base);
  return results;
}

// @illusion: resolve_inputs -> expands files/dirs/globs -> supported file paths
export function resolveInputs(inputs: string[]): string[] {
  const out = new Set<string>();
  // @illusion: resolve_each_input -> walks inputs -> expands files/dirs/globs
  for (const input of inputs) {
    let stat: fs.Stats | null = null;
    // @illusion: probe_path -> treats missing/invalid path as glob pattern
    try {
      stat = fs.statSync(input);
    } catch {
      stat = null;
    }
    if (stat && stat.isDirectory()) {
      walkDir(input, out);
    } else if (stat && stat.isFile()) {
      out.add(path.resolve(input));
    } else {
      // @illusion: add_glob_matches -> collects glob matches -> adds to result set
      for (const m of expandGlob(input)) out.add(m);
    }
  }
  return [...out].filter((f) => {
    const lang = languageIdFromPath(f);
    return lang && getLanguageConfig(lang);
  });
}

// @illusion: analyze_project -> analyzes every file -> builds one unified cross-file call graph
export async function analyzeProject(filePaths: string[], options?: AnalyzeOptions): Promise<ProjectAnalysis> {
  const resolved = filePaths.length > 0 ? resolveInputs(filePaths) : [];
  const files: ResolvedFile[] = [];
  const entries: ProjectFileEntry[] = [];

  // @illusion: read_analyze_each_file -> loads source -> runs single-file analysis
  for (const fp of resolved) {
    const filePath = path.resolve(fp);
    const source = fs.readFileSync(filePath, 'utf8');
    const languageId = languageIdFromPath(filePath);
    if (!languageId) continue;
    const analysis = await analyzeFileCore(source, languageId, filePath, options);
    files.push({ filePath, analysis });
    entries.push({
      filePath,
      result: {
        language: analysis.language,
        grammarUsed: analysis.grammarUsed,
        source,
        cards: analysis.cards,
        executionFlow: '',
        note: analysis.note,
      },
    });
  }

  const allCards: Card[] = [];
  const globalIdOf = new Map<string, string>();
  const perFileNameIndex = new Map<string, Map<string, string>>();
  const globalNameIndex = new Map<string, string>();
  let gi = 0;

  // @illusion: build_unified_index -> assigns global ids -> indexes cards by name/file
  for (const f of files) {
    const fileMap = new Map<string, string>();
    perFileNameIndex.set(f.filePath, fileMap);
    // @illusion: index_cards -> walks cards -> assigns global id + indexes by name
    for (const c of f.analysis.cards) {
      const gid = `g${gi++}`;
      globalIdOf.set(f.filePath + ' ' + c.id, gid);
      allCards.push({ ...c, id: gid, filePath: f.filePath });
      if (c.name && isCallableKind(c.kind)) {
        fileMap.set(c.name, gid);
        if (!globalNameIndex.has(c.name)) globalNameIndex.set(c.name, gid);
      }
    }
  }

  const fileCallNames = new Map<string, Map<string, string[]>>();
  // @illusion: collect_file_calls -> walks files -> maps per-file calls by global id
  for (const f of files) {
    const m = new Map<string, string[]>();
    if (f.analysis.blockInfos.length > 0) {
      // @illusion: extract_block_calls -> walks block infos -> records call names
      for (const bi of f.analysis.blockInfos) {
        const gid = globalIdOf.get(f.filePath + ' ' + bi.cardId);
        if (gid) m.set(gid, extractCallNames(bi.node, isCallScopeBoundary));
      }
    } else {
      // @illusion: fallback_calls -> walks fallback cards -> records stored calls
      for (const c of f.analysis.cards) {
        const gid = globalIdOf.get(f.filePath + ' ' + c.id);
        if (gid) m.set(gid, c.calls);
      }
    }
    fileCallNames.set(f.filePath, m);
  }

  const fileExternalLabels = new Map<string, Map<string, string>>();
  // @illusion: collect_external_labels -> walks files -> resolves imported name labels
  for (const f of files) {
    if (f.analysis.importMap.size > 0) {
      const labels = await resolveExternalLabels(f.analysis.importMap);
      if (labels) fileExternalLabels.set(f.filePath, labels);
    }
  }

  const edges: CallGraphEdge[] = [];
  const calleeIds = new Set<string>();
  const externalCards = new Map<string, ExternalCard>();
  const seenEdge = new Set<string>();

  // @illusion: resolve_edges -> links each call to same-file/imported/global target -> external fallback
  for (const f of files) {
    const callNames = fileCallNames.get(f.filePath);
    const importMap = f.analysis.importMap;
    const extLabels = fileExternalLabels.get(f.filePath);
    if (!callNames) continue;
    // @illusion: link_calls -> walks caller->names -> resolves edges to targets
    for (const [gid, names] of callNames) {
      const seenCallee = new Set<string>();
      // @illusion: resolve_callee -> walks caller names -> finds same-file/import/global target
      for (const n of names) {
        if (seenCallee.has(n)) continue;
        seenCallee.add(n);
        const sameFileGid = perFileNameIndex.get(f.filePath)?.get(n);
        let targetGid: string | undefined;
        let externalName: string | undefined;

        if (sameFileGid && sameFileGid !== gid) {
          targetGid = sameFileGid;
        } else {
          const imp = importMap.get(n);
          if (imp) {
            const otherGid = perFileNameIndex.get(imp.file)?.get(imp.exported);
            if (otherGid) targetGid = otherGid;
            else externalName = n;
          } else {
            const gGid = globalNameIndex.get(n);
            if (gGid && gGid !== gid) targetGid = gGid;
            else if (extLabels?.has(n)) externalName = n;
          }
        }

        if (targetGid) {
          const key = gid + '->' + targetGid;
          if (!seenEdge.has(key)) {
            seenEdge.add(key);
            edges.push({ callerCardId: gid, calleeCardId: targetGid, calleeName: n });
            calleeIds.add(targetGid);
          }
        } else if (externalName) {
          const extId = `external:${externalName}`;
          const key = gid + '->' + extId;
          if (!seenEdge.has(key)) {
            seenEdge.add(key);
            edges.push({ callerCardId: gid, calleeCardId: extId, calleeName: externalName, external: true });
            const label = extLabels?.get(externalName);
            if (label) externalCards.set(extId, { name: externalName, label: `↪ ${label}` });
            calleeIds.add(extId);
          }
        }
      }
    }
  }

  const entryPointIds = allCards.filter((c) => isCallableKind(c.kind) && !calleeIds.has(c.id)).map((c) => c.id);
  const narratives = composeNarratives(allCards, edges, options?.narrativeDepth, externalCards);
  const executionFlow = buildExecutionFlow(allCards, narratives, entryPointIds);

  const coverage = aggregateCoverage(entries);

  return { files: entries, allCards, edges, entryPointIds, externalCards, narratives, executionFlow, coverage };
}

// @illusion: aggregate_coverage -> sums annotated/total across files -> lists missing blocks
export function aggregateCoverage(entries: ProjectFileEntry[]): {
  total: number;
  annotated: number;
  missing: ProjectMissing[];
} {
  let total = 0;
  let annotated = 0;
  const missing: ProjectMissing[] = [];
  // @illusion: tally_coverage -> walks entries -> sums annotated/total + missing
  for (const { filePath, result } of entries) {
    // @illusion: count_card -> walks cards -> accumulates coverage + missing blocks
    for (const c of result.cards) {
      total++;
      if (c.label != null) annotated++;
      else missing.push({ file: filePath, kind: c.kind, name: c.name, startLine: c.startLine, endLine: c.endLine });
    }
  }
  return { total, annotated, missing };
}
