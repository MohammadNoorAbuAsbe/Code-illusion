import { TSNode, BlockDescriptor } from './types';

const FUNC_TYPES = new Set([
  'function_declaration',
  'function_expression',
  'generator_function_declaration',
  'method_definition',
  'method_declaration',
  'constructor',
  'variable_declarator'
]);

const CLASS_TYPES = new Set(['class_declaration', 'class_definition']);

const BLOCK_TYPES = new Set([
  'try_statement',
  'for_statement',
  'while_statement',
  'for_in_statement',
  'for_of_statement'
]);

function isFunctionValue(node: TSNode): boolean {
  const v = node.childForFieldName('value');
  if (!v) {
    return false;
  }
  return v.type === 'arrow_function' || v.type.includes('function');
}

export function isBlock(node: TSNode): boolean {
  const t = node.type;
  if (CLASS_TYPES.has(t)) {
    return true;
  }
  if (BLOCK_TYPES.has(t)) {
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

export function getBlockName(node: TSNode): string | null {
  if (node.type === 'constructor') {
    return 'constructor';
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
  return null;
}

export function extractBlocks(tree: { rootNode: TSNode }): BlockDescriptor[] {
  const out: BlockDescriptor[] = [];
  const visit = (node: TSNode) => {
    if (isBlock(node)) {
      out.push({ node, kind: node.type, name: getBlockName(node) });
    }
    for (const c of node.children) {
      visit(c);
    }
  };
  visit(tree.rootNode);
  return out;
}
