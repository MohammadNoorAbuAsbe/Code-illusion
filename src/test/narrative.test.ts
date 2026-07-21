import { TestState, assert } from './assert';
import { composeNarratives, buildExecutionFlow } from '../core/narrative';
import { Card, CallGraphEdge } from '../core/types';

// @illusion: run_tests -> tests narrative depth/cycles/formatting
export async function runTests(state: TestState): Promise<void> {
  console.log('=== Narrative Composition ===');

  const chainCards: Card[] = [
    { id: 'A', name: 'A', label: 'root -> calls B -> done', kind: 'function_declaration', startLine: 1, endLine: 1, code: '', calls: [], narrative: null },
    { id: 'B', name: 'B', label: 'B -> calls C -> returns', kind: 'function_declaration', startLine: 1, endLine: 1, code: '', calls: [], narrative: null },
    { id: 'C', name: 'C', label: 'C -> does work -> returns', kind: 'function_declaration', startLine: 1, endLine: 1, code: '', calls: [], narrative: null },
    { id: 'D', name: 'D', label: 'D -> leaf fn', kind: 'function_declaration', startLine: 1, endLine: 1, code: '', calls: [], narrative: null },
  ];
  const chainEdges: CallGraphEdge[] = [
    { callerCardId: 'A', calleeCardId: 'B', calleeName: 'B' },
    { callerCardId: 'B', calleeCardId: 'C', calleeName: 'C' },
    { callerCardId: 'C', calleeCardId: 'D', calleeName: 'D' },
  ];

  // @illusion: test_depth_3 -> verifies deep recursion renders correctly
  const deepNarr = composeNarratives(chainCards, chainEdges, 3);
  const aNarr = deepNarr.get('A') ?? '';
  assert(state, 'depth-3 includes root A', aNarr.includes('root'));
  assert(state, 'depth-3 includes level-1 B', aNarr.includes('calls B'));
  assert(state, 'depth-3 includes level-2 C', aNarr.includes('does work'));
  assert(state, 'depth-3 includes level-3 D', aNarr.includes('leaf fn'));
  assert(state, 'depth-3 has 4 lines', aNarr.split('\n').length === 4, `got ${aNarr.split('\n').length}`);

  // @illusion: test_depth_1 -> verifies shallow depth stops at first level
  const shallowNarr = composeNarratives(chainCards, chainEdges, 1);
  const aShallow = shallowNarr.get('A') ?? '';
  assert(state, 'depth-1 shows B', aShallow.includes('calls B'));
  assert(state, 'depth-1 stops before C', !aShallow.includes('does work'), `got: ${aShallow}`);

  // @illusion: test_cycle -> detects and marks cycles
  const cycleCards: Card[] = [
    { id: 'X', name: 'X', label: 'X -> calls Y', kind: 'function_declaration', startLine: 1, endLine: 1, code: '', calls: [], narrative: null },
    { id: 'Y', name: 'Y', label: 'Y -> calls X', kind: 'function_declaration', startLine: 1, endLine: 1, code: '', calls: [], narrative: null },
  ];
  const cycleEdges: CallGraphEdge[] = [
    { callerCardId: 'X', calleeCardId: 'Y', calleeName: 'Y' },
    { callerCardId: 'Y', calleeCardId: 'X', calleeName: 'X' },
  ];
  const cycleNarr = composeNarratives(cycleCards, cycleEdges, 3);
  const xNarr = cycleNarr.get('X') ?? '';
  assert(state, 'cycle detected', xNarr.includes('cycle back'), `got: ${xNarr}`);

  // @illusion: test_external_cards -> external cards appear as leaves
  const extCards = new Map<string, { name: string; label: string }>();
  extCards.set('external:extFn', { name: 'extFn', label: '↪ extFn -> does external work' });
  const extCardsList: Card[] = [
    { id: 'M', name: 'M', label: 'M -> calls external', kind: 'function_declaration', startLine: 1, endLine: 1, code: '', calls: [], narrative: null },
  ];
  const extEdges: CallGraphEdge[] = [
    { callerCardId: 'M', calleeCardId: 'external:extFn', calleeName: 'extFn', external: true },
  ];
  const extNarr = composeNarratives(extCardsList, extEdges, 2, extCards);
  const mNarr = extNarr.get('M') ?? '';
  assert(state, 'external leaf rendered', mNarr.includes('does external work'), `got: ${mNarr}`);

  // @illusion: test_execution_flow -> joins entry points into a story
  const flow = buildExecutionFlow(chainCards, deepNarr, ['A', 'D']);
  assert(state, 'execution flow is non-empty', flow.length > 0);
  assert(state, 'flow includes entry point A', flow.includes('root'));
  assert(state, 'flow includes entry point D', flow.includes('leaf fn'));
}
