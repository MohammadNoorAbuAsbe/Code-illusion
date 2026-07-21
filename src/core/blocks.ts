import { TSNode, BlockDescriptor } from './types';

const FUNC_TYPES = new Set([
  'function_declaration',
  'function_expression',
  'generator_function_declaration',
  'generator_function',
  'method_definition',
  'method_declaration',
  'generator_method',
  'constructor',
  'variable_declarator',
  'arrow_function',
]);

const CLASS_TYPES = new Set(['class_declaration', 'class_definition']);

const BLOCK_TYPES = new Set([
  'try_statement',
  'for_statement',
  'while_statement',
  'for_in_statement',
  'for_of_statement',
]);

const ACCESSOR_TYPES = new Set(['getter', 'setter', 'pair_getter', 'pair_setter']);

// @illusion: is_function_value -> checks if a variable_declarator's value is a function
function isFunctionValue(node: TSNode): boolean {
  const v = node.childForFieldName('value');
  if (!v) {
    return false;
  }
  return v.type === 'arrow_function' || v.type.includes('function');
}

// @illusion: is_block -> true if node is an extractable function/class/loop/try/accessor block
export function isBlock(node: TSNode): boolean {
  const t = node.type;
  if (CLASS_TYPES.has(t)) {
    return true;
  }
  if (BLOCK_TYPES.has(t)) {
    return true;
  }
  if (ACCESSOR_TYPES.has(t)) {
    return true;
  }
  if (FUNC_TYPES.has(t)) {
    if (t === 'variable_declarator') {
      return isFunctionValue(node);
    }
    return true;
  }
  return false;
}

// @illusion: is_call_scope_boundary -> true for nested functions/blocks that end a caller's direct-call scope
export function isCallScopeBoundary(node: TSNode): boolean {
  if (node.type === 'arrow_function') return true;
  return isBlock(node);
}

// @illusion: get_block_name -> reads the node's name field -> returns block identifier
export function getBlockName(node: TSNode): string | null {
  if (node.type === 'constructor') {
    return 'constructor';
  }
  if (ACCESSOR_TYPES.has(node.type)) {
    const nameNode = node.childForFieldName('name') ?? node.childForFieldName('property');
    return nameNode?.text ?? null;
  }
  const named = node.childForFieldName('name');
  if (named) {
    return named.text;
  }
  if (node.type === 'variable_declarator') {
    const v = node.childForFieldName('value');
    if (v && (v.type === 'arrow_function' || v.type.includes('function'))) {
      return node.childForFieldName('name')?.text ?? null;
    }
  }
  if (node.type === 'arrow_function' && node.parent?.type === 'variable_declarator') {
    return node.parent.childForFieldName('name')?.text ?? null;
  }
  return null;
}

// @illusion: extract_blocks -> walks tree -> collects all extractable blocks with names
export function extractBlocks(tree: { rootNode: TSNode }): BlockDescriptor[] {
  const out: BlockDescriptor[] = [];
  // @illusion: visit -> recurses tree nodes -> records extractable blocks
  const visit = (node: TSNode) => {
    if (isBlock(node)) {
      out.push({ node, kind: node.type, name: getBlockName(node) });
    }
    // @illusion: recurse_children -> walks node children -> visits each
    for (const c of node.children) {
      visit(c);
    }
  };
  visit(tree.rootNode);
  return out;
}
