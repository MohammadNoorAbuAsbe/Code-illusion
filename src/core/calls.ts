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

// @illusion: is_callable_kind -> true for node kinds that can be direct call targets
export function isCallableKind(kind: string): boolean {
  return CALLABLE_KINDS.has(kind);
}

// @illusion: extract_call_names -> walks node -> lists called identifiers (stops at nested blocks)
export function extractCallNames(node: TSNode, blockPred: BlockPredicate): string[] {
  const names: string[] = [];

  const seen = new Set<string>();
  // @illusion: add_name -> deduplicates -> appends new call name
  const addName = (name: string) => {
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  };

  // @illusion: visit -> walks call nodes -> records called identifiers (stops at nested blocks)
  const visit = (n: TSNode) => {
    if (n !== node && blockPred(n)) {
      return;
    }
    if (n.type === 'call_expression') {
      const fn = n.childForFieldName('function');
      if (fn) {
        if (fn.type === 'identifier') {
          addName(fn.text);
        } else if (fn.type === 'member_expression') {
          const prop = fn.childForFieldName('property');
          if (prop && prop.type === 'property_identifier') {
            addName(prop.text);
          }
        }
      }
    } else if (n.type === 'new_expression') {
      // @illusion: capture_ctor -> reads constructor name -> records as call
      const ctor = n.childForFieldName('constructor');
      if (ctor) {
        if (ctor.type === 'identifier') {
          addName(ctor.text);
        } else if (ctor.type === 'member_expression') {
          const prop = ctor.childForFieldName('property');
          if (prop && prop.type === 'property_identifier') {
            addName(prop.text);
          }
        }
      }
    }
    // @illusion: recurse_children -> walks children -> continues call scan
    for (const c of n.children) {
      visit(c);
    }
  };

  visit(node);
  return names;
}

// @illusion: build_call_graph -> maps calls to card edges -> computes entry points + external leaves
export function buildCallGraph(
  blocks: BlockInfo[],
  blockPred: BlockPredicate,
  externalResolver?: (name: string) => string | null
): BuildCallGraphResult {
  const nameToCard = new Map<string, { cardId: string; name: string }>();
  const duplicateNames = new Map<string, string[]>();

  // @illusion: index_blocks -> walks blocks -> maps names to cards (tracks duplicates)
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
    // @illusion: warn_duplicates -> walks dup names -> logs ambiguous call targets
    for (const [name, ids] of duplicateNames) {
      console.warn(
        `Code Illusion: duplicate function name "${name}" (cards: ${ids.join(', ')}); call graph may be ambiguous`
      );
    }
  }

  const edges: CallGraphEdge[] = [];
  const calledIds = new Set<string>();
  const externalCards = new Map<string, { name: string; label: string }>();

  // @illusion: link_callees -> walks blocks -> builds call edges (local/duplicate/external)
  for (const b of blocks) {
    const callerId = b.cardId;
    const callNames = extractCallNames(b.node, blockPred);

    // @illusion: resolve_targets -> walks callee names -> emits edges to resolved targets
    for (const name of callNames) {
      const target = nameToCard.get(name);
      if (target && target.cardId !== callerId) {
        edges.push({ callerCardId: callerId, calleeCardId: target.cardId, calleeName: target.name });
        calledIds.add(target.cardId);
      } else if (!target && externalResolver) {
        const label = externalResolver(name);
        if (label) {
          const extId = `external:${name}`;
          edges.push({ callerCardId: callerId, calleeCardId: extId, calleeName: name, external: true });
          externalCards.set(extId, { name, label: `↪ ${label}` });
          calledIds.add(extId);
        }
      }
    }
  }

  const callableIds = new Set(blocks.filter((b) => isCallableKind(b.kind)).map((b) => b.cardId));
  const entryPointIds = [...callableIds].filter((id) => !calledIds.has(id));

  return { edges, entryPointIds, externalCards };
}
