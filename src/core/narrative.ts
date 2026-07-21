import { Card, CallGraphEdge, ExternalCard } from './types';

const DEFAULT_MAX_DEPTH = 2;

interface TreeNode {
  name: string | null;
  label: string;
  children: TreeNode[];
}

// @illusion: build_tree -> recurses callees -> composes a narrative TreeNode (cycle-aware)
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

  // @illusion: walk_callees -> walks call edges -> builds child narrative nodes
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

// @illusion: format_tree_node -> recurses children -> emits box-drawing lines at any depth
function formatTreeNode(node: TreeNode, prefix: string): string {
  let result = '';
  node.children.forEach((child, i) => {
    const last = i === node.children.length - 1;
    const connector = last ? '\u2514\u2500 ' : '\u251C\u2500 ';
    result += `${prefix}${connector}${child.label}\n`;
    const childPrefix = prefix + (last ? '   ' : '\u2502  ');
    if (child.children.length > 0) {
      result += formatTreeNode(child, childPrefix);
    }
  });
  return result.replace(/\n$/, '');
}

// @illusion: format_tree -> renders root label + recursive children into a tree string
function formatTree(root: TreeNode): string {
  const childrenLines = formatTreeNode(root, '  ');
  return childrenLines ? `${root.label}\n${childrenLines}` : root.label;
}

// @illusion: render_tree -> builds + formats a single card's narrative tree
function renderTree(
  cardId: string,
  maxDepth: number,
  cardMap: Map<string, Card>,
  calleeMap: Map<string, CallGraphEdge[]>,
  externalCards?: Map<string, ExternalCard>
): string | null {
  const tree = buildTree(cardId, 0, maxDepth, cardMap, calleeMap, new Set(), externalCards);
  if (!tree) return null;
  return formatTree(tree);
}

// @illusion: compose_narratives -> renders a narrative tree for every labelled card
export function composeNarratives(
  cards: Card[],
  edges: CallGraphEdge[],
  maxDepth?: number,
  externalCards?: Map<string, ExternalCard>
): Map<string, string> {
  const cardMap = new Map(cards.map((c) => [c.id, c]));
  const calleeMap = new Map<string, CallGraphEdge[]>();

  // @illusion: group_edges -> walks edges -> buckets callees per caller card
  for (const edge of edges) {
    if (!calleeMap.has(edge.callerCardId)) {
      calleeMap.set(edge.callerCardId, []);
    }
    calleeMap.get(edge.callerCardId)!.push(edge);
  }

  const depth = maxDepth ?? DEFAULT_MAX_DEPTH;
  const result = new Map<string, string>();
  // @illusion: render_each_card -> walks cards -> composes narrative tree per labelled card
  for (const card of cards) {
    if (card.label) {
      const n = renderTree(card.id, depth, cardMap, calleeMap, externalCards);
      if (n) result.set(card.id, n);
    }
  }

  return result;
}

// @illusion: build_execution_flow -> joins entry-point narratives into a file-level story
export function buildExecutionFlow(cards: Card[], narratives: Map<string, string>, entryPointIds: string[]): string {
  const cardMap = new Map(cards.map((c) => [c.id, c]));
  const parts: string[] = [];

  // @illusion: join_entry_flow -> walks entry points -> assembles file-level execution story
  for (const id of entryPointIds) {
    const card = cardMap.get(id);
    const narrative = narratives.get(id);
    if (card && narrative) {
      parts.push(narrative);
    }
  }

  return parts.join('\n');
}
