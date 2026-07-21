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

// @illusion: analyze_fallback -> regex extracts @illusion blocks when no grammar is available
function analyzeFallback(source: string): Card[] {
  const lines = source.split('\n');
  const cards: Card[] = [];
  const re = /@illusion\s*:\s*(.+)/;
  const blockStartRe =
    /^\s*(?:(?:export|async|default|static|declare|abstract|public|private|protected|readonly)\s+)*(?:function|class|constructor|try|for|while|do|switch|if|catch|else|const|let|var|[A-Za-z_$][\w$]*\s*\()\b/;
  const nameRe = /(?:function|class|\b(?:const|let|var))\s+([A-Za-z_$][\w$]*)/;
  const callRe = /([A-Za-z_$][\w$]*)\s*\(/g;

  // @illusion: scan_lines -> walks source lines -> extracts @illusion annotation blocks
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) {
      continue;
    }
    let end = i;

    // @illusion: find_block_end -> walks forward -> bounds the annotation's block span
    for (let j = i + 1; j < lines.length; j++) {
      const trimmed = lines[j].trim();
      if (trimmed === '' || re.test(lines[j])) {
        end = j - 1;
        break;
      }
      if (j === lines.length - 1) {
        end = j;
        break;
      }
    }

    let kind = 'annotation';
    let name: string | null = null;
    const blockLine = lines[i + 1] || '';
    const blockMatch = blockStartRe.exec(blockLine);
    if (blockMatch) {
      if (blockMatch[0].trim().startsWith('(') || /[A-Za-z_$][\w$]*\s*\(/.test(blockLine)) {
        kind = 'method_definition';
        const methodName = blockLine.match(/([A-Za-z_$][\w$]*)\s*\(/);
        if (methodName) name = methodName[1];
      } else {
        kind = blockMatch[0].trim().split(/\s+/).pop() as string;
        const nameMatch = nameRe.exec(blockLine);
        if (nameMatch) {
          name = nameMatch[1];
        }
      }
    }

    // Best-effort: extract called identifiers within the block body.
    const calls: string[] = [];
    const callSeen = new Set<string>();
    // @illusion: scan_block_calls -> walks block lines -> collects called identifiers
    for (let k = i + 1; k <= end; k++) {
      const line = lines[k];
      if (re.test(line)) break;
      let cm: RegExpExecArray | null;
      callRe.lastIndex = 0;
      // @illusion: match_calls -> iterates regex hits -> records unique call names
      while ((cm = callRe.exec(line)) !== null) {
        const candidate = cm[1];
        if (!callSeen.has(candidate) && !DECL_KEYWORDS.has(candidate) && candidate !== name) {
          callSeen.add(candidate);
          calls.push(candidate);
        }
      }
    }

    const label = m[1]
      .trim()
      .replace(/\*\/\s*$/, '')
      .trim();
    cards.push({
      id: `${i + 1}:${end + 1}:${kind}`,
      startLine: i + 1,
      endLine: end + 1,
      kind,
      name,
      label,
      code: lines.slice(i, end + 1).join('\n'),
      calls,
      narrative: null,
    });
  }
  return cards;
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
    // Cross-file: resolve imported functions one level deep (relative named imports).
    let externalResolver: ((name: string) => string | null) | undefined;
    if (filePath && fa.importMap.size > 0) {
      const externalLabels = await resolveExternalLabels(fa.importMap);
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
