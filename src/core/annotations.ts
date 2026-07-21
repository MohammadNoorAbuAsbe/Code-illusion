import { AnalysisResult, Card, TSNode, BlockInfo } from './types';
import { getLanguageConfig } from './languages';
import { parse } from './parser';
import { extractBlocks, isBlock, isCallScopeBoundary } from './blocks';
import { extractCallNames, buildCallGraph } from './calls';
import { composeNarratives, buildExecutionFlow } from './narrative';
import { extractImports, resolveExternalLabels, ImportRef } from './crossfile';
import * as path from 'path';

const PUNCTUATION = new Set(['{', '}', '(', ')', ';', ',']);
const DECL_KEYWORDS = new Set(['export', 'async', 'default', 'static', 'declare', 'abstract']);

// @illusion: same_pos -> true when two nodes occupy identical start/end positions
function samePos(a: TSNode, b: TSNode): boolean {
  return (
    a.startPosition.row === b.startPosition.row &&
    a.startPosition.column === b.startPosition.column &&
    a.endPosition.row === b.endPosition.row &&
    a.endPosition.column === b.endPosition.column
  );
}

// @illusion: preceding_comments -> climbs parents -> collects @illusion comments directly above node
export function precedingComments(node: TSNode): string[] {
  let current: TSNode | null = node;
  // @illusion: climb_parents -> walks up parent chain -> collects preceding @illusion comments
  while (current && current.parent) {
    const parent: TSNode = current.parent;
    const pending: string[] = [];
    let inBlockComment = false;
    let blockCommentText = '';

    // @illusion: scan_siblings -> walks parent children -> harvests @illusion comments above node
    for (const s of parent.children) {
      if (samePos(s, current)) {
        if (inBlockComment) {
          pending.push(blockCommentText);
          blockCommentText = '';
          inBlockComment = false;
        }
        // Comments sit directly above the node within this parent: use them.
        if (pending.length > 0) return pending;
        // No comment here. Climb to ancestors, but stop at the first enclosing
        // extractable block (function/class/try/loop) — its own annotation lives
        // above it, not above `node`, so we must not inherit it.
        break;
      }
      const t = (s.type ?? '').toLowerCase();

      if (inBlockComment) {
        blockCommentText += '\n' + s.text;
        if (t.includes('comment') && s.text.includes('*/')) {
          pending.push(blockCommentText);
          blockCommentText = '';
          inBlockComment = false;
        }
        continue;
      }

      if (t.includes('comment')) {
        pending.push(s.text);
      } else if (PUNCTUATION.has(s.type)) {
        continue;
      } else if (DECL_KEYWORDS.has(s.type)) {
        continue;
      } else {
        pending.length = 0;
      }
    }
    // Stop climbing once we reach an enclosing extractable block; comments above
    // it belong to that block, not to the nested node we started from.
    if (isBlock(parent)) return [];
    current = parent;
  }
  return [];
}

// @illusion: extract_label -> scans comments -> returns the @illusion summary text
export function extractLabel(comments: string[]): string | null {
  // @illusion: scan_comments -> finds first @illusion label -> returns it
  for (const c of comments) {
    const m = c.match(/@illusion\s*:\s*(.+)/);
    if (m) {
      let label = m[1].trim();
      label = label
        .replace(/\*\/\s*$/, '')
        .replace(/^\*\s?/, '')
        .trim();
      return label || null;
    }
  }
  return null;
}

// @illusion: build_card_from_block -> reads block -> derives id/label/code -> returns Card
export function buildCardFromBlock(block: { node: TSNode; kind: string; name: string | null }): Card {
  const { node, kind, name } = block;
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const comments = precedingComments(node);
  const label = extractLabel(comments);
  return {
    id: `${startLine}:${endLine}:${kind}`,
    startLine,
    endLine,
    kind,
    name,
    label,
    code: node.text,
    calls: [],
    narrative: null,
  };
}

// @illusion: find_brace_scope -> walks forward from start -> tracks brace depth -> returns end line
function findBraceScope(lines: string[], start: number): number {
  let depth = 0;
  let started = false;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') { depth--; }
    }
    if (started && depth === 0) return i;
  }
  return lines.length - 1;
}

// @illusion: classify_decl -> examines a line -> determines block kind and name
function classifyDecl(line: string): { kind: string | null; name: string | null } {
  const declKinds = ['async function', 'function', 'class', 'constructor'];
  for (const dk of declKinds) {
    const re = new RegExp(`^(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?${dk}\\s+([A-Za-z_$][\\w$]*)`);
    const m = line.match(re);
    if (m) return { kind: dk.includes('function') ? 'function_declaration' : dk, name: m[1] };
  }
  const anonFn = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\(/;
  if (anonFn.test(line)) return { kind: 'function_expression', name: null };
  const classRe = /^(?:export\s+)?(?:default\s+)?class\s*\{/;
  if (classRe.test(line)) return { kind: 'class_declaration', name: null };
  const tryRe = /^\s*try\s*\{/;
  if (tryRe.test(line)) return { kind: 'try_statement', name: null };
  const loopRe = /^\s*(for|while|do)\s*\(/;
  const loopM = line.match(loopRe);
  if (loopM) return { kind: `${loopM[1]}_statement`, name: null };
  const forOf = /^\s*for\s*\(/;
  if (forOf.test(line)) return { kind: 'for_statement', name: null };
  const varFnRe = /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/;
  const varFnM = line.match(varFnRe);
  if (varFnM) return { kind: 'variable_declarator', name: varFnM[1] };
  const varArrowRe = /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\s*)?\(/;
  const varArrowM = line.match(varArrowRe);
  if (varArrowM) return { kind: 'variable_declarator', name: varArrowM[1] };
  const methodRe = /^\s*(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\(/;
  const methodM = line.match(methodRe);
  if (methodM && !methodM[1].startsWith('if') && !methodM[1].startsWith('for') && !methodM[1].startsWith('while')) {
    return { kind: 'method_definition', name: methodM[1] };
  }
  return { kind: null, name: null };
}

// @illusion: extract_calls_lines -> walks block range -> returns deduplicated call names
function extractCallsLines(lines: string[], start: number, end: number): string[] {
  const callRe = /([A-Za-z_$][\w$]*)\s*\(/g;
  const seen = new Set<string>();
  const calls: string[] = [];
  for (let i = start; i <= end; i++) {
    const line = lines[i];
    callRe.lastIndex = 0;
    let cm: RegExpExecArray | null;
    while ((cm = callRe.exec(line)) !== null) {
      const candidate = cm[1];
      if (!seen.has(candidate) && !DECL_KEYWORDS.has(candidate)) {
        seen.add(candidate);
        calls.push(candidate);
      }
    }
  }
  return calls;
}

// @illusion: analyze_fallback -> regex extracts all blocks (annotated and unannotated) when no grammar is available
function analyzeFallback(source: string): Card[] {
  const lines = source.split('\n');
  const cards: Card[] = [];
  const annoRe = /@illusion\s*:\s*(.+)/;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const labelMatch = line.match(annoRe);
    const decl = classifyDecl(line);
    let kind: string;
    let name: string | null;
    let label: string | null = null;
    let blockStart: number;
    let blockEnd: number;

    if (labelMatch) {
      label = labelMatch[1].trim().replace(/\*\/\s*$/, '').trim();
      blockStart = i;
      const nextLine = lines[i + 1] || '';
      const nextDecl = classifyDecl(nextLine);
      if (nextDecl.kind) {
        kind = nextDecl.kind;
        name = nextDecl.name;
      } else {
        kind = 'annotation';
        name = null;
      }
      blockEnd = i;
      for (let j = i + 1; j < lines.length; j++) {
        const trimmed = lines[j].trim();
        if (trimmed === '' || annoRe.test(lines[j])) {
          blockEnd = j - 1;
          break;
        }
        if (j === lines.length - 1) { blockEnd = j; break; }
      }
    } else if (decl.kind) {
      kind = decl.kind;
      name = decl.name;
      blockStart = i;
      label = null;
      if (line.includes('{') && !line.includes('}')) {
        blockEnd = findBraceScope(lines, i);
      } else if (line.includes('=>') && !line.includes('{')) {
        blockEnd = i;
      } else {
        blockEnd = i;
        for (let j = i + 1; j < lines.length; j++) {
          const trimmed = lines[j].trim();
          if (trimmed.startsWith('function') || trimmed.startsWith('class') ||
              trimmed.startsWith('for') || trimmed.startsWith('while') ||
              trimmed.startsWith('try') || trimmed.startsWith('do') ||
              trimmed.startsWith('}') || trimmed.startsWith('// @illusion') ||
              annoRe.test(trimmed)) {
            blockEnd = j - 1;
            break;
          }
          if (j === lines.length - 1) { blockEnd = j; break; }
        }
      }
    } else {
      i++;
      continue;
    }

    const endLine = Math.max(blockEnd, i);
    const calls = extractCallsLines(lines, i, endLine);
    cards.push({
      id: `${i + 1}:${endLine + 1}:${kind}`,
      startLine: i + 1,
      endLine: endLine + 1,
      kind,
      name,
      label,
      code: lines.slice(blockStart, endLine + 1).join('\n'),
      calls,
      narrative: null,
    });
    i = endLine + 1;
  }

  // Deduplicate: if a card has a label and another identical card (same name/kind) doesn't, keep the labelled one
  const deduped: Card[] = [];
  const seenKey = new Set<string>();
  for (const c of cards) {
    if (c.label) {
      deduped.push(c);
      seenKey.add(`${c.kind}:${c.name}`);
    } else if (!seenKey.has(`${c.kind}:${c.name}`)) {
      deduped.push(c);
    }
  }
  return deduped;
}

export interface AnalyzeOptions {
  narrativeDepth?: number;
}

// @illusion: analyze_document -> parses source -> builds cards + call graph + narrative + flow
export interface FileAnalysis {
  language: string;
  grammarUsed: boolean;
  source: string;
  cards: Card[];
  blockInfos: BlockInfo[];
  importMap: Map<string, ImportRef>;
  note?: string;
}

// @illusion: analyze_file_core -> parses/extracts a single file -> returns cards + block structure
export async function analyzeFileCore(
  source: string,
  languageId: string,
  filePath?: string,
  _options?: AnalyzeOptions
): Promise<FileAnalysis> {
  const config = getLanguageConfig(languageId);
  if (config && config.grammar) {
    // @illusion: guard_parse -> catches grammar parse failure -> falls back to regex
    try {
      const tree = await parse(source, config.grammar);
      const blocks = extractBlocks(tree);
      const cards = blocks.map((b) => buildCardFromBlock(b));
      const blockInfos = blocks.map((b, i) => ({
        node: b.node,
        cardId: cards[i].id,
        name: b.name,
        kind: b.kind,
      }));
      const importMap = filePath ? extractImports(tree, path.dirname(filePath)) : new Map<string, ImportRef>();
      return { language: languageId, grammarUsed: true, source, cards, blockInfos, importMap };
    } catch (e) {
      console.warn('Code Illusion: grammar parse failed, using fallback', e);
    }
  }
  return {
    language: languageId,
    grammarUsed: false,
    source,
    cards: analyzeFallback(source),
    blockInfos: [],
    importMap: new Map<string, ImportRef>(),
    note: config
      ? 'Grammar unavailable — using regex fallback (call graph/narrative disabled).'
      : 'Language not supported by tree-sitter grammars — using regex fallback.',
  };
}

// @illusion: analyze_document -> parses/extracts single file -> builds call graph -> returns cards + story
export async function analyzeDocument(
  source: string,
  languageId: string,
  filePath?: string,
  options?: AnalyzeOptions
): Promise<AnalysisResult> {
  const fa = await analyzeFileCore(source, languageId, filePath, options);
  if (fa.grammarUsed) {
    // Cross-file: resolve imported functions recursively (relative named imports).
    let externalResolver: ((name: string) => string | null) | undefined;
    if (filePath && fa.importMap.size > 0) {
      const narrativeDepth = options?.narrativeDepth ?? getLanguageConfig(languageId)?.narrativeDepth ?? 2;
      const externalLabels = await resolveExternalLabels(fa.importMap, narrativeDepth);
      externalResolver = (name) => externalLabels.get(name) ?? null;
    }

    const depth = options?.narrativeDepth ?? getLanguageConfig(languageId)?.narrativeDepth;
    const { edges, entryPointIds, externalCards } = buildCallGraph(
      fa.blockInfos,
      isCallScopeBoundary,
      externalResolver
    );
    const narratives = composeNarratives(fa.cards, edges, depth, externalCards);
    const executionFlow = buildExecutionFlow(fa.cards, narratives, entryPointIds);

    // @illusion: attach_calls -> walks cards -> sets calls + narrative per card
    for (let i = 0; i < fa.cards.length; i++) {
      fa.cards[i].calls = extractCallNames(fa.blockInfos[i].node, isCallScopeBoundary);
      fa.cards[i].narrative = narratives.get(fa.cards[i].id) ?? null;
    }

    return { language: languageId, grammarUsed: true, source, cards: fa.cards, executionFlow };
  }
  return {
    language: languageId,
    grammarUsed: false,
    source,
    cards: fa.cards,
    executionFlow: '',
    note: fa.note,
  };
}
