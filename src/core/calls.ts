import { TSNode, BlockInfo, CallGraphEdge, BuildCallGraphResult, BlockPredicate } from './types';

const CALLABLE_KINDS = new Set([
  'function_declaration',
  'function_expression',
  'generator_function_declaration',
  'method_definition',
  'method_declaration',
  'constructor',
  'arrow_function',
  'variable_declarator',
]);

export function isCallableKind(kind: string): boolean {
  return CALLABLE_KINDS.has(kind);
}

export function extractCallNames(node: TSNode, blockPred: BlockPredicate): string[] {
  const names: string[] = [];

  const visit = (n: TSNode) => {
    if (n !== node && blockPred(n)) {
      return;
    }
    if (n.type === 'call_expression') {
      const fn = n.childForFieldName('function');
      if (fn) {
        if (fn.type === 'identifier') {
          names.push(fn.text);
        } else if (fn.type === 'member_expression') {
          const prop = fn.childForFieldName('property');
          if (prop && prop.type === 'property_identifier') {
            names.push(prop.text);
          }
        }
      }
    }
    for (const c of n.children) {
      visit(c);
    }
  };

  visit(node);
  return names;
}

export function buildCallGraph(
  blocks: BlockInfo[],
  blockPred: BlockPredicate
): BuildCallGraphResult {
  const nameToCard = new Map<string, { cardId: string; name: string }>();
  const duplicateNames = new Map<string, string[]>();

  for (const b of blocks) {
    if (isCallableKind(b.kind) && b.name) {
      if (nameToCard.has(b.name)) {
        if (!duplicateNames.has(b.name)) {
          duplicateNames.set(b.name, [nameToCard.get(b.name)!.cardId]);
        }
        duplicateNames.get(b.name)!.push(b.cardId);
      }
      nameToCard.set(b.name, { cardId: b.cardId, name: b.name });
    }
  }

  if (duplicateNames.size > 0) {
    for (const [name, ids] of duplicateNames) {
      console.warn(`Code Illusion: duplicate function name "${name}" (cards: ${ids.join(', ')}); call graph may be ambiguous`);
    }
  }

  const edges: CallGraphEdge[] = [];
  const calledIds = new Set<string>();

  for (const b of blocks) {
    const callerId = b.cardId;
    const callNames = extractCallNames(b.node, blockPred);

    for (const name of callNames) {
      const target = nameToCard.get(name);
      if (target && target.cardId !== callerId) {
        edges.push({ callerCardId: callerId, calleeCardId: target.cardId, calleeName: target.name });
        calledIds.add(target.cardId);
      }
    }
  }

  const callableIds = new Set(blocks.filter((b) => isCallableKind(b.kind)).map((b) => b.cardId));
  const entryPointIds = [...callableIds].filter((id) => !calledIds.has(id));

  return { edges, entryPointIds };
}
