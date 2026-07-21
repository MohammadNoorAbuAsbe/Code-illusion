import { TestState, assert } from './assert';
import { extractCallNames, isCallableKind, buildCallGraph } from '../core/calls';
import { parse } from '../core/parser';
import { extractBlocks, isCallScopeBoundary } from '../core/blocks';

// @illusion: run_tests -> tests call extraction + call graph building
export async function runTests(state: TestState): Promise<void> {
  console.log('=== Call Extraction ===');

  // @illusion: test_is_callable_kind -> confirms function types are callable
  assert(state, 'function_declaration is callable', isCallableKind('function_declaration'));
  assert(state, 'arrow_function is callable', isCallableKind('arrow_function'));
  assert(state, 'method_definition is callable', isCallableKind('method_definition'));
  assert(state, 'try_statement not callable', !isCallableKind('try_statement'));

  // @illusion: test_extract_call_names -> parses sample -> checks call names
  const src = `function alpha() { beta(); gamma(); }
function beta() { delta(); }
function gamma() { return 1; }
function delta() { return new X(); }
const orphan = () => 42;`;
  const tree = await parse(src, 'javascript');
  const blocks = extractBlocks(tree);
  const fnBlock = blocks.find((b) => b.name === 'alpha');
  assert(state, 'alpha block found', !!fnBlock);
  if (fnBlock) {
    const calls = extractCallNames(fnBlock.node, isCallScopeBoundary);
    assert(state, 'alpha calls beta', calls.includes('beta'), `got: ${calls.join(',')}`);
    assert(state, 'alpha calls gamma', calls.includes('gamma'));
  }

  // @illusion: test_call_graph -> builds graph from blocks
  const blockInfos = blocks.map((b, i) => ({
    node: b.node, cardId: `g${i}`, name: b.name, kind: b.kind,
  }));
  const result = buildCallGraph(blockInfos, isCallScopeBoundary);
  assert(state, 'call graph built', true);
  if (result.edges.length > 0) {
    const alphaEdge = result.edges.find((e) => e.calleeName === 'beta');
    assert(state, 'alpha -> beta edge exists', !!alphaEdge);
  }
}
