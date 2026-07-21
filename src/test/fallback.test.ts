import { TestState, assert } from './assert';
import { analyzeDocument } from '../core/annotations';

// @illusion: run_tests -> tests regex fallback parser with no grammar
export async function runTests(state: TestState): Promise<void> {
  console.log('=== Fallback Parser ===');

  // @illusion: test_basic_fallback -> parses annotated and unannotated blocks in plaintext
  const fbSrc = `// @illusion: do_thing -> does a thing
function doThing() {
  helper();
  helper();
  other();
}

function noLabel(x) { return x * 2; }`;
  const fbRes = await analyzeDocument(fbSrc, 'plaintext');
  assert(state, 'fallback used', fbRes.grammarUsed === false);
  assert(state, 'fallback produced cards', fbRes.cards.length > 0, `got ${fbRes.cards.length} cards`);

  const fbCard = fbRes.cards.find((c) => c.name === 'doThing');
  assert(state, 'fallback finds annotated function', !!fbCard, 'doThing missing');
  if (fbCard) {
    assert(state, 'fallback extracts calls (deduped)', fbCard.calls.includes('helper') && fbCard.calls.includes('other'), `got: ${fbCard.calls.join(',')}`);
    assert(state, 'fallback dedupes repeated call', fbCard.calls.filter((c) => c === 'helper').length === 1);
  }

  const noLabelCard = fbRes.cards.find((c) => c.name === 'noLabel');
  assert(state, 'fallback finds unannotated function', !!noLabelCard, 'noLabel missing');

  // @illusion: test_html_fallback -> parses HTML-style @illusion comments
  const htmlSample = `<!-- @illusion: header_section -> renders page header -->
<header><nav><a href="/">Home</a></nav></header>

<!-- @illusion: footer_section -> renders page footer -->
<footer><p>&copy; 2026</p></footer>
`;
  const htmlRes = await analyzeDocument(htmlSample, 'html');
  assert(state, 'html fallback returns cards', htmlRes.cards.length > 0, `got ${htmlRes.cards.length} cards`);
  if (htmlRes.cards.length > 0) {
    assert(state, 'html card has label', htmlRes.cards[0].label !== null);
    assert(state, 'html card parsed header_section', htmlRes.cards[0].label?.includes('header_section') === true);
  }

  // @illusion: test_empty_source -> empty input produces no cards
  const emptyRes = await analyzeDocument('', 'plaintext');
  assert(state, 'empty source produces no cards', emptyRes.cards.length === 0, `got ${emptyRes.cards.length}`);

  // @illusion: test_arrow_fn_fallback -> detects const arrow functions
  const arrowSrc = `const handler = (x) => x * 2;`;
  const arrowRes = await analyzeDocument(arrowSrc, 'plaintext');
  assert(state, 'fallback finds arrow function', arrowRes.cards.length > 0);
  const arrowCard = arrowRes.cards.find((c) => c.name === 'handler');
  assert(state, 'arrow function has name', !!arrowCard, `cards: ${arrowRes.cards.map(c => `${c.name ?? '?'}(${c.kind})`).join(', ')}`);
}
