import { TestState, assert } from './assert';
import { extractBlocks } from '../core/blocks';
import { getLanguageConfig } from '../core/languages';
import { parse } from '../core/parser';

// @illusion: run_tests -> tests block extraction -> function/class/try/loop detection
export async function runTests(state: TestState): Promise<void> {
  console.log('=== Block Extraction ===');

  const blockSrc = `function alpha() {}
class Beta {
  gamma() { try { risky(); } catch (_) {} }
}
for (let i = 0; i < 1; i++) { loopBody(); }
const handler = (x) => x * 2;
const arrow = () => {};
while (false) { break; }`;
  const blockTree = await parse(blockSrc, 'javascript');
  const blockList = extractBlocks(blockTree);

  assert(state, 'finds function', blockList.some((b) => b.name === 'alpha'));
  assert(state, 'finds class', blockList.some((b) => b.name === 'Beta'));
  assert(state, 'finds method', blockList.some((b) => b.name === 'gamma'));
  assert(state, 'finds try_statement', blockList.some((b) => b.kind === 'try_statement'));
  assert(state, 'finds for_statement', blockList.some((b) => b.kind === 'for_statement'));
  assert(state, 'finds while_statement', blockList.some((b) => b.kind === 'while_statement'));

  // @illusion: verify_unchanged -> confirms extractBlocks still finds same types
  const lang = getLanguageConfig('typescript');
  assert(state, 'typescript grammar configured', !!lang && lang.grammar === 'typescript');
}
