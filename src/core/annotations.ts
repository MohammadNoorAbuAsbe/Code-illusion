import { AnalysisResult, Card, TSNode } from './types';
import { getLanguageConfig } from './languages';
import { parse } from './parser';
import { extractBlocks, isBlock, isCallScopeBoundary } from './blocks';
import { extractCallNames, buildCallGraph } from './calls';
import { composeNarratives, buildExecutionFlow } from './narrative';
import { extractImports, resolveExternalLabels } from './crossfile';
import * as path from 'path';

const PUNCTUATION = new Set(['{', '}', '(', ')', ';', ',']);
const DECL_KEYWORDS = new Set(['export', 'async', 'default', 'static', 'declare', 'abstract']);

function samePos(a: TSNode, b: TSNode): boolean {
  return (
    a.startPosition.row === b.startPosition.row &&
    a.startPosition.column === b.startPosition.column &&
    a.endPosition.row === b.endPosition.row &&
    a.endPosition.column === b.endPosition.column
  );
}

export function precedingComments(node: TSNode): string[] {
  let current: TSNode | null = node;
  while (current && current.parent) {
    const parent: TSNode = current.parent;
    const pending: string[] = [];
    let inBlockComment = false;
    let blockCommentText = '';

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

export function extractLabel(comments: string[]): string | null {
  for (const c of comments) {
    const m = c.match(/@illusion\s*:\s*(.+)/);
    if (m) {
      let label = m[1].trim();
      label = label.replace(/\*\/\s*$/, '').replace(/^\*\s?/, '').trim();
      return label || null;
    }
  }
  return null;
}

function buildCardFromBlock(block: { node: TSNode; kind: string; name: string | null }): Card {
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
    narrative: null
  };
}

function analyzeFallback(source: string): Card[] {
  const lines = source.split('\n');
  const cards: Card[] = [];
  const re = /@illusion\s*:\s*(.+)/;
  const blockStartRe = /^\s*(?:(?:export|async|default|static|declare|abstract)\s+)?(function|class|constructor|method|try|for|while|do|switch|if)\b/;
  const nameRe = /(?:function|class|method)\s+(\w+)/;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) {
      continue;
    }
    let end = i;

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
    const blockMatch = blockLine.match(blockStartRe);
    if (blockMatch) {
      kind = blockMatch[1];
      const nameMatch = blockLine.match(nameRe);
      if (nameMatch) {
        name = nameMatch[1];
      }
    }

    const label = m[1].trim().replace(/\*\/\s*$/, '').trim();
    cards.push({
      id: `${i + 1}:${end + 1}:${kind}`,
      startLine: i + 1,
      endLine: end + 1,
      kind,
      name,
      label,
      code: lines.slice(i, end + 1).join('\n'),
      calls: [],
      narrative: null
    });
  }
  return cards;
}

export async function analyzeDocument(source: string, languageId: string, filePath?: string): Promise<AnalysisResult> {
  const config = getLanguageConfig(languageId);
  if (config && config.grammar) {
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

      // Cross-file: resolve imported functions one level deep (relative named imports).
      let externalResolver: ((name: string) => string | null) | undefined;
      if (filePath) {
        const importMap = extractImports(tree, path.dirname(filePath));
        if (importMap.size > 0) {
          const externalLabels = await resolveExternalLabels(importMap);
          externalResolver = (name) => externalLabels.get(name) ?? null;
        }
      }

      const { edges, entryPointIds, externalCards } = buildCallGraph(blockInfos, isCallScopeBoundary, externalResolver);
      const narratives = composeNarratives(cards, edges, config?.narrativeDepth, externalCards);
      const executionFlow = buildExecutionFlow(cards, narratives, entryPointIds);

      for (let i = 0; i < cards.length; i++) {
        cards[i].calls = extractCallNames(blocks[i].node, isCallScopeBoundary);
        cards[i].narrative = narratives.get(cards[i].id) ?? null;
      }

      return { language: languageId, grammarUsed: true, source, cards, executionFlow };
    } catch (e) {
      console.warn('Code Illusion: grammar parse failed, using fallback', e);
      const cards = analyzeFallback(source);
      return { language: languageId, grammarUsed: false, source, cards, executionFlow: '' };
    }
  }
  const cards = analyzeFallback(source);
  return { language: languageId, grammarUsed: false, source, cards, executionFlow: '' };
}
