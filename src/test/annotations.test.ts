import { TestState, assert } from './assert';
import { analyzeDocument } from '../core/annotations';

// @illusion: run_tests -> tests annotation extraction + language config
export async function runTests(state: TestState): Promise<void> {
  console.log('=== Annotation Extraction ===');

  const sample = `// @illusion: main -> runs pipeline -> coordinates work
function main() {
  const result = fetchData();
  printResult(result);
}

// @illusion: fetchData -> sends request -> parses response
function fetchData() {
  return 'data';
}

function unannotated(x) { return x; }
`;
  const res = await analyzeDocument(sample, 'javascript');
  assert(state, 'grammar parse attempted', typeof res.grammarUsed === 'boolean');
  assert(state, 'cards returned', res.cards.length > 0);

  const mainCard = res.cards.find((c) => c.name === 'main');
  assert(state, 'main card found', !!mainCard);
  if (mainCard) {
    assert(state, 'main has label', !!mainCard.label, `got: ${mainCard.label}`);
    assert(state, 'main label uses arrow notation', mainCard.label!.includes('->'), mainCard.label!);
  }

  const missing = res.cards.filter((c) => c.label == null);
  assert(state, 'unannotated block detected', missing.length > 0, `found ${missing.length} missing`);

  const legacySample = `// @preserve @illusion: legacy_fn -> old style -> still read
function legacyFn() { return 1; }`;
  const legacyRes = await analyzeDocument(legacySample, 'javascript');
  const legacyCard = legacyRes.cards.find((c) => c.name === 'legacyFn');
  assert(state, '@preserve @illusion extracted', !!legacyCard && legacyCard.label === 'legacy_fn -> old style -> still read', `got: ${legacyCard?.label}`);
}
