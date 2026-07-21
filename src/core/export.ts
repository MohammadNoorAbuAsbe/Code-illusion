import { Card, CallGraphEdge, AnalysisResult } from './types';
import * as path from 'path';
import * as fs from 'fs';

// @illusion: GodNodeInfo -> card metadata + call in-degree
export interface GodNodeInfo {
  card: Card;
  inDegree: number;
}

// @illusion: SurprisingConnection -> cross-file edge between unrelated modules
export interface SurprisingConnection {
  callerFile: string;
  callerName: string | null;
  calleeFile: string;
  calleeName: string | null;
  calleeAnnotation: string | null;
}

// @illusion: DirectoryCoverage -> annotation stats per directory
export interface DirectoryCoverage {
  directory: string;
  annotated: number;
  total: number;
  percent: number;
}

// @illusion: PriorityGap -> unannotated block that is called by other blocks (breaks narrative)
export interface PriorityGap {
  card: Card;
  inDegree: number;
  calledBy: string[];
}

// @illusion: CoverageJson -> machine-readable artifact structure
export interface CoverageJson {
  generatedAt: string;
  summary: {
    files: number;
    totalBlocks: number;
    annotatedBlocks: number;
    annotPercent: number;
    entryPoints: { total: number; annotated: number };
  };
  godNodes: { id: string; name: string | null; kind: string; file: string; line: number; inDegree: number; annotated: boolean }[];
  surprisingConnections: { callerFile: string; callerName: string | null; calleeFile: string; calleeName: string | null; calleeAnnotated: boolean }[];
  directoryCoverage: { directory: string; annotated: number; total: number; percent: number }[];
  priorityGaps: { id: string; name: string | null; kind: string; file: string; line: number; inDegree: number; calledBy: string[] }[];
}

// @illusion: ArtifactFile -> file path + content to write
export interface ArtifactFile {
  path: string;
  content: string;
}

// @illusion: compute_god_nodes -> counts in-degree per card from call edges -> sorted desc
export function computeGodNodes(allCards: Card[], edges: CallGraphEdge[]): GodNodeInfo[] {
  const inDegree = new Map<string, number>();
  for (const e of edges) {
    if (e.external) continue;
    inDegree.set(e.calleeCardId, (inDegree.get(e.calleeCardId) ?? 0) + 1);
  }
  const cardMap = new Map(allCards.map((c) => [c.id, c]));
  const result: GodNodeInfo[] = [];
  for (const [id, count] of inDegree) {
    const card = cardMap.get(id);
    if (card) result.push({ card, inDegree: count });
  }
  result.sort((a, b) => b.inDegree - a.inDegree);
  return result;
}

// @illusion: compute_surprising_connections -> finds edges where caller and callee are in different files
export function computeSurprisingConnections(allCards: Card[], edges: CallGraphEdge[]): SurprisingConnection[] {
  const cardMap = new Map(allCards.map((c) => [c.id, c]));
  const result: SurprisingConnection[] = [];
  for (const e of edges) {
    if (e.external) continue;
    const caller = cardMap.get(e.callerCardId);
    const callee = cardMap.get(e.calleeCardId);
    if (!caller || !callee) continue;
    if (caller.filePath && callee.filePath && caller.filePath !== callee.filePath) {
      result.push({
        callerFile: caller.filePath,
        callerName: caller.name,
        calleeFile: callee.filePath,
        calleeName: callee.name,
        calleeAnnotation: callee.label,
      });
    }
  }
  return result;
}

// @illusion: compute_directory_coverage -> groups cards by directory -> computes per-dir stats
export function computeDirectoryCoverage(allCards: Card[]): DirectoryCoverage[] {
  const dirs = new Map<string, { annotated: number; total: number }>();
  for (const c of allCards) {
    const dir = c.filePath ? path.dirname(c.filePath) : '(unknown)';
    const entry = dirs.get(dir) ?? { annotated: 0, total: 0 };
    entry.total++;
    if (c.label != null) entry.annotated++;
    dirs.set(dir, entry);
  }
  const result: DirectoryCoverage[] = [];
  for (const [directory, { annotated, total }] of dirs) {
    result.push({
      directory,
      annotated,
      total,
      percent: total > 0 ? Math.round((annotated / total) * 100) : 0,
    });
  }
  result.sort((a, b) => b.percent - a.percent);
  return result;
}

// @illusion: compute_priority_gaps -> finds unannotated cards that are called by other blocks
export function computePriorityGaps(allCards: Card[], edges: CallGraphEdge[]): PriorityGap[] {
  const inDegree = new Map<string, { count: number; callers: string[] }>();
  const cardMap = new Map(allCards.map((c) => [c.id, c]));
  for (const e of edges) {
    if (e.external) continue;
    const entry = inDegree.get(e.calleeCardId) ?? { count: 0, callers: [] };
    entry.count++;
    const caller = cardMap.get(e.callerCardId);
    const callerName = caller?.name ?? caller?.kind ?? e.callerCardId;
    if (!entry.callers.includes(callerName)) entry.callers.push(callerName);
    inDegree.set(e.calleeCardId, entry);
  }
  const result: PriorityGap[] = [];
  for (const c of allCards) {
    if (c.label != null) continue;
    const degree = inDegree.get(c.id);
    if (degree && degree.count > 0) {
      result.push({ card: c, inDegree: degree.count, calledBy: degree.callers });
    }
  }
  result.sort((a, b) => b.inDegree - a.inDegree);
  return result;
}

// @illusion: compute_entry_point_summary -> returns annotated/total entry point counts
export function computeEntryPointSummary(allCards: Card[], entryPointIds: string[]): { total: number; annotated: number } {
  const entryCards = allCards.filter((c) => entryPointIds.includes(c.id));
  return {
    total: entryCards.length,
    annotated: entryCards.filter((c) => c.label != null).length,
  };
}

// @illusion: format_coverage_markdown -> renders the human-readable COVERAGE.md
export function formatCoverageMarkdown(
  files: number,
  total: number,
  annotated: number,
  entryPoints: { total: number; annotated: number },
  godNodes: GodNodeInfo[],
  surprisingConns: SurprisingConnection[],
  dirCoverage: DirectoryCoverage[],
  priorityGaps: PriorityGap[]
): string {
  const pct = total > 0 ? Math.round((annotated / total) * 100) : 0;
  const now = new Date().toISOString();
  const entryPct = entryPoints.total > 0 ? Math.round((entryPoints.annotated / entryPoints.total) * 100) : 0;
  const lines: string[] = [];

  lines.push('# Code Illusion — Annotation Health', '');
  lines.push(`Generated: ${now}`, '');
  lines.push('## Summary', '');
  lines.push(`- **Files analyzed**: ${files}`);
  lines.push(`- **Total blocks**: ${total}`);
  lines.push(`- **Annotated**: ${annotated}/${total} (**${pct}%**)`);
  lines.push(`- **Entry points**: ${entryPoints.annotated}/${entryPoints.total} (**${entryPct}%**)`);
  lines.push('');

  // Critical status badges
  if (pct === 100) {
    lines.push('✅ **100% annotated — no gaps.**');
  } else if (entryPoints.annotated < entryPoints.total) {
    lines.push('⚠ **Entry points have gaps — narrative flow will be broken.**');
  } else if (priorityGaps.length > 0) {
    lines.push(`⚠ **${priorityGaps.length} called-but-unannotated block(s) — narrative trees truncated.**`);
  } else {
    lines.push(`**${total - annotated} unannotated block(s) remain.**`);
  }
  lines.push('');

  // God nodes
  if (godNodes.length > 0) {
    lines.push('## God Nodes (most-cited blocks)', '');
    lines.push('These blocks are called by the most other blocks. Annotating them has the highest impact on narrative quality.');
    lines.push('');
    lines.push('| Rank | Block | File | Called By | Annotation |');
    lines.push('|------|-------|------|-----------|------------|');
    const top = godNodes.slice(0, 20);
    top.forEach((gn, i) => {
      const name = gn.card.name ?? gn.card.kind;
      const file = gn.card.filePath ? path.relative(process.cwd(), gn.card.filePath) : '(unknown)';
      const calledBy = String(gn.inDegree);
      const status = gn.card.label ? `✅ ${gn.card.label.slice(0, 60)}` : '⚠ MISSING';
      lines.push(`| ${i + 1} | \`${name}\` | \`${file}\` | ${calledBy} | ${status} |`);
    });
    lines.push('');
  }

  // Surprising connections
  if (surprisingConns.length > 0) {
    lines.push('## Surprising Connections (cross-module edges)', '');
    lines.push('These edges connect unrelated modules — they may indicate architectural coupling worth reviewing.');
    lines.push('');
    const top = surprisingConns.slice(0, 20);
    top.forEach((sc) => {
      const callerRel = path.relative(process.cwd(), sc.callerFile);
      const calleeRel = path.relative(process.cwd(), sc.calleeFile);
      const callerName = sc.callerName ?? '(anonymous)';
      const calleeName = sc.calleeName ?? '(anonymous)';
      const status = sc.calleeAnnotation ? '✅' : '⚠ missing annotation';
      lines.push(`- \`${callerRel}:${callerName}\` → \`${calleeRel}:${calleeName}\` ${status}`);
    });
    lines.push('');
  }

  // Coverage by directory
  if (dirCoverage.length > 0) {
    lines.push('## Coverage by Directory', '');
    lines.push('| Directory | Annotated | Total | % |');
    lines.push('|-----------|-----------|-------|---|');
    for (const dc of dirCoverage) {
      const dir = dc.directory === '(unknown)' ? '(unknown)' : path.relative(process.cwd(), dc.directory) || '.';
      lines.push(`| \`${dir}\` | ${dc.annotated} | ${dc.total} | ${dc.percent}% |`);
    }
    lines.push('');
  }

  // Priority gaps
  if (priorityGaps.length > 0) {
    lines.push('## Missing Blocks (highest priority)', '');
    lines.push('_Blocks that are unannotated but are called by other blocks — they break narrative trees._');
    lines.push('');
    const top = priorityGaps.slice(0, 20);
    top.forEach((pg) => {
      const name = pg.card.name ?? pg.card.kind;
      const file = pg.card.filePath ? path.relative(process.cwd(), pg.card.filePath) : '(unknown)';
      lines.push(`- \`${name}\` in \`${file}\`:L${pg.card.startLine} — called by ${pg.inDegree} block(s) (\`${pg.calledBy.join(', ')}\`)`);
    });
    if (priorityGaps.length > 20) {
      lines.push(`- _... and ${priorityGaps.length - 20} more_`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// @illusion: format_coverage_json -> builds the machine-readable CoverageJson structure
export function formatCoverageJson(
  files: number,
  total: number,
  annotated: number,
  entryPoints: { total: number; annotated: number },
  godNodes: GodNodeInfo[],
  surprisingConns: SurprisingConnection[],
  dirCoverage: DirectoryCoverage[],
  priorityGaps: PriorityGap[]
): CoverageJson {
  const pct = total > 0 ? Math.round((annotated / total) * 100) : 0;
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      files,
      totalBlocks: total,
      annotatedBlocks: annotated,
      annotPercent: pct,
      entryPoints,
    },
    godNodes: godNodes.slice(0, 20).map((gn) => ({
      id: gn.card.id,
      name: gn.card.name,
      kind: gn.card.kind,
      file: gn.card.filePath ?? '(unknown)',
      line: gn.card.startLine,
      inDegree: gn.inDegree,
      annotated: gn.card.label != null,
    })),
    surprisingConnections: surprisingConns.slice(0, 20).map((sc) => ({
      callerFile: sc.callerFile,
      callerName: sc.callerName,
      calleeFile: sc.calleeFile,
      calleeName: sc.calleeName,
      calleeAnnotated: sc.calleeAnnotation != null,
    })),
    directoryCoverage: dirCoverage.map((dc) => ({
      directory: dc.directory,
      annotated: dc.annotated,
      total: dc.total,
      percent: dc.percent,
    })),
    priorityGaps: priorityGaps.slice(0, 20).map((pg) => ({
      id: pg.card.id,
      name: pg.card.name,
      kind: pg.card.kind,
      file: pg.card.filePath ?? '(unknown)',
      line: pg.card.startLine,
      inDegree: pg.inDegree,
      calledBy: pg.calledBy,
    })),
  };
}

// @illusion: build_artifacts -> takes analysis inputs -> returns all artifact files to write
export interface BuildArtifactsInput {
  files: { filePath: string; result: AnalysisResult }[];
  allCards: Card[];
  edges: CallGraphEdge[];
  entryPointIds: string[];
  executionFlow: string;
}

// @illusion: build_artifacts -> computes all supplementary analysis -> renders markdown + JSON artifacts
export function buildArtifacts(input: BuildArtifactsInput): ArtifactFile[] {
  const { files, allCards, edges, entryPointIds, executionFlow } = input;
  const total = allCards.length;
  const annotated = allCards.filter((c) => c.label != null).length;
  const entryPoints = computeEntryPointSummary(allCards, entryPointIds);
  const godNodes = computeGodNodes(allCards, edges);
  const surprisingConns = computeSurprisingConnections(allCards, edges);
  const dirCoverage = computeDirectoryCoverage(allCards);
  const priorityGaps = computePriorityGaps(allCards, edges);

  const coverageMd = formatCoverageMarkdown(
    files.length, total, annotated, entryPoints,
    godNodes, surprisingConns, dirCoverage, priorityGaps
  );

  const coverageJson = formatCoverageJson(
    files.length, total, annotated, entryPoints,
    godNodes, surprisingConns, dirCoverage, priorityGaps
  );

  const storyContent = executionFlow || '(no execution flow — no entry points or all fallback mode)';

  return [
    { path: 'COVERAGE.md', content: coverageMd },
    { path: 'STORY.md', content: storyContent + '\n' },
    { path: 'coverage.json', content: JSON.stringify(coverageJson, null, 2) + '\n' },
  ];
}

// @illusion: get_default_out_dir -> returns default output directory path
export function getDefaultOutDir(): string {
  return path.resolve(process.cwd(), 'code-illusion-out');
}

// @illusion: ensure_out_dir -> creates directory if it doesn't exist -> returns path
export function ensureOutDir(outDir?: string): string {
  const dir = outDir ? path.resolve(outDir) : getDefaultOutDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// @illusion: write_artifacts -> writes artifact files to the output directory -> returns written paths
export function writeArtifacts(artifacts: ArtifactFile[], outDir?: string): string[] {
  const dir = ensureOutDir(outDir);
  const written: string[] = [];
  for (const a of artifacts) {
    const absPath = path.join(dir, a.path);
    fs.writeFileSync(absPath, a.content, 'utf8');
    written.push(absPath);
  }
  return written;
}

// @illusion: write_gitignore -> writes or appends code-illusion-out/cache to .gitignore
export function writeGitignore(outDir?: string): void {
  const dir = outDir ? path.resolve(outDir) : getDefaultOutDir();
  const gitignorePath = path.join(dir, '..', '.gitignore');
  const entry = path.basename(dir) + '/cache';
  let content = '';
  try {
    content = fs.readFileSync(gitignorePath, 'utf8');
  } catch {
    // file doesn't exist yet
  }
  if (!content.split('\n').some((l) => l.trim() === entry)) {
    const sep = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(gitignorePath, content + sep + entry + '\n', 'utf8');
  }
}
