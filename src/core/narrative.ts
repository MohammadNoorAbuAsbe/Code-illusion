import { Card, CallGraphEdge, ExternalCard } from './types';

const DEFAULT_MAX_DEPTH = 2;

interface TreeNode {
  name: string | null;
  label: string;
  children: TreeNode[];
}

function buildTree(
  cardId: string,
  depth: number,
  maxDepth: number,
  cardMap: Map<string, Card>,
  calleeMap: Map<string, CallGraphEdge[]>,
  path: Set<string>,
  externalCards?: Map<string, ExternalCard>
): TreeNode | null {
  if (depth > maxDepth) return null;

  const card = cardMap.get(cardId);
  if (!card || !card.label) return null;

  if (path.has(cardId)) {
    return { name: card.name, label: `${card.label} (cycle back)`, children: [] };
  }

  path.add(cardId);

  const edges = calleeMap.get(cardId) ?? [];
  const seen = new Set<string>();
  const children: TreeNode[] = [];

  for (const edge of edges) {
    if (seen.has(edge.calleeName)) continue;
    seen.add(edge.calleeName);

    const callee = cardMap.get(edge.calleeCardId);
    if (!callee) {
      const ext = externalCards?.get(edge.calleeCardId);
      if (ext) {
        children.push({ name: ext.name, label: ext.label, children: [] });
      } else {
        children.push({ name: edge.calleeName, label: `${edge.calleeName} \u26A0 missing annotation`, children: [] });
      }
      continue;
    }

    let child: TreeNode | null;
    if (callee.label) {
      child = buildTree(edge.calleeCardId, depth + 1, maxDepth, cardMap, calleeMap, path, externalCards);
    } else {
      child = { name: edge.calleeName, label: `${edge.calleeName} \u26A0 missing annotation`, children: [] };
    }
    if (child) children.push(child);
  }

  path.delete(cardId);

  return { name: card.name, label: card.label, children };
}

function formatTreeNode(node: TreeNode, prefix: string = '', isRoot: boolean = true): string {
  const line = isRoot ? node.label : `${prefix}${node.label}`;
  let result = line;

  for (let i = 0; i < node.children.length; i++) {
    const last = i === node.children.length - 1;
    const child = node.children[i];
    const connector = last ? '\u2514\u2500 ' : '\u251C\u2500 ';
    const indent = isRoot ? '  ' : prefix.slice(0, -2) + (last ? '   ' : '\u2502  ');

    result += `\n${indent}${connector}${child.label}`;

    if (child.children.length > 0) {
      const childPrefix = indent + (last ? '   ' : '\u2502  ');
      for (let j = 0; j < child.children.length; j++) {
        const lastChild = j === child.children.length - 1;
        const gc = child.children[j];
        const gcConnector = lastChild ? '\u2514\u2500 ' : '\u251C\u2500 ';
        result += `\n${childPrefix}${gcConnector}${gc.label}`;
      }
    }
  }

  return result;
}

function renderTree(
  cardId: string,
  maxDepth: number,
  cardMap: Map<string, Card>,
  calleeMap: Map<string, CallGraphEdge[]>,
  externalCards?: Map<string, ExternalCard>
): string | null {
  const tree = buildTree(cardId, 0, maxDepth, cardMap, calleeMap, new Set(), externalCards);
  if (!tree) return null;
  return formatTreeNode(tree, '', true);
}

export function composeNarratives(
  cards: Card[],
  edges: CallGraphEdge[],
  maxDepth?: number,
  externalCards?: Map<string, ExternalCard>
): Map<string, string> {
  const cardMap = new Map(cards.map((c) => [c.id, c]));
  const calleeMap = new Map<string, CallGraphEdge[]>();

  for (const edge of edges) {
    if (!calleeMap.has(edge.callerCardId)) {
      calleeMap.set(edge.callerCardId, []);
    }
    calleeMap.get(edge.callerCardId)!.push(edge);
  }

  const depth = maxDepth ?? DEFAULT_MAX_DEPTH;
  const result = new Map<string, string>();
  for (const card of cards) {
    if (card.label) {
      const n = renderTree(card.id, depth, cardMap, calleeMap, externalCards);
      if (n) result.set(card.id, n);
    }
  }

  return result;
}

export function buildExecutionFlow(
  cards: Card[],
  narratives: Map<string, string>,
  entryPointIds: string[]
): string {
  const cardMap = new Map(cards.map((c) => [c.id, c]));
  const parts: string[] = [];

  for (const id of entryPointIds) {
    const card = cardMap.get(id);
    const narrative = narratives.get(id);
    if (card && narrative) {
      parts.push(narrative);
    }
  }

  return parts.join('\n');
}
