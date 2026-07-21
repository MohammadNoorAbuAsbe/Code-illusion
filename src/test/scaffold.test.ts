import { TestState, assert } from './assert';
import { scaffoldProposals, placeholderText } from '../core/scaffold';
import { analyzeDocument } from '../core/annotations';
import { Card } from '../core/types';

// @illusion: run_tests -> tests scaffold proposal generation
export async function runTests(state: TestState): Promise<void> {
  console.log('=== Scaffold ===');

  // @illusion: test_placeholder_text -> generates correct placeholder for all languages
  const card: Card = { id: '1:1:function_declaration', name: 'myFunc', kind: 'function_declaration', startLine: 1, endLine: 1, code: 'function myFunc() {}', calls: [], narrative: null, label: null };
  const tsPlaceholder = placeholderText(card, 'typescript');
  assert(state, 'ts placeholder has @illusion', tsPlaceholder.includes('@illusion'));
  assert(state, 'ts placeholder has function name', tsPlaceholder.includes('myFunc'));
  assert(state, 'ts uses // comment', tsPlaceholder.startsWith('//'), tsPlaceholder);

  const pyPlaceholder = placeholderText(card, 'python');
  assert(state, 'py uses # comment', pyPlaceholder.startsWith('#'), pyPlaceholder);

  const htmlCard: Card = { ...card, kind: 'function_declaration', id: '1:5:function_declaration', code: 'function myFunc() {}' };
  const htmlPlaceholder = placeholderText(htmlCard, 'html');
  assert(state, 'html uses <!-- comment', htmlPlaceholder.includes('<!--'), htmlPlaceholder);

  // @illusion: test_scaffold_proposals -> generates proposals for missing blocks
  const src = `function annotated() {}
// @illusion: has_label -> does work
function hasLabel() {}
function noLabel() {}
`;
  const res = await analyzeDocument(src, 'javascript');
  const proposals = scaffoldProposals(src, res.cards, 'javascript');
  assert(state, 'scaffold finds missing blocks', proposals.length > 0, `got ${proposals.length}`);
  if (proposals.length > 0) {
    assert(state, 'proposal contains @illusion', proposals[0].snippet.includes('@illusion'));
    assert(state, 'proposal has line number', proposals[0].line > 0);
  }
}
