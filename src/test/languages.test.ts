import { TestState, assert } from './assert';
import { languageIdFromPath, getLanguageConfig, highlightId, LANGUAGES } from '../core/languages';

// @illusion: run_tests -> tests language config resolution
export async function runTests(state: TestState): Promise<void> {
  console.log('=== Language Config ===');

  assert(state, '.ts -> typescript', languageIdFromPath('foo.ts') === 'typescript');
  assert(state, '.js -> javascript', languageIdFromPath('foo.js') === 'javascript');
  assert(state, '.py -> python', languageIdFromPath('foo.py') === 'python');
  assert(state, '.rs -> rust', languageIdFromPath('foo.rs') === 'rust');
  assert(state, '.go -> go', languageIdFromPath('foo.go') === 'go');
  assert(state, '.java -> java', languageIdFromPath('foo.java') === 'java');
  assert(state, '.cs -> csharp', languageIdFromPath('foo.cs') === 'csharp');
  assert(state, '.txt -> null', languageIdFromPath('foo.txt') === null);
  assert(state, 'typescript grammar', getLanguageConfig('typescript')?.grammar === 'typescript');
  assert(state, 'python comment #', (getLanguageConfig('python')?.comment as { token: string }).token === '#');
  assert(state, 'js comment //', (getLanguageConfig('javascript')?.comment as { token: string }).token === '//');
  assert(state, 'highlightId for ts', highlightId('typescript') === 'typescript');
  assert(state, 'highlightId for unknown', highlightId('unknown') === 'plaintext');
  assert(state, 'default grammar is empty', LANGUAGES._default?.grammar === '');

  const jsx = getLanguageConfig('javascriptreact');
  assert(state, 'JSX uses tsx grammar', !!jsx && jsx.grammar === 'tsx');
  const tsx = getLanguageConfig('typescriptreact');
  assert(state, 'TSX uses tsx grammar', !!tsx && tsx.grammar === 'tsx');
}
