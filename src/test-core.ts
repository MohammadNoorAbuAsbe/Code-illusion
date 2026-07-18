import { analyzeDocument } from './core/annotations';

const sample = `// @preserve @illusion: main -> runs pipeline -> coordinates work
function main() {
  const result = fetchData();
  printResult(result);
  helper();
}

// @preserve @illusion: fetchData -> sends request -> parses response
function fetchData() {
  return 'data';
}

// @preserve @illusion: printResult -> formats data -> logs output
function printResult(data) {
  console.log(data);
}

function noAnnotation(x) {
  return x * 2;
}

// @preserve @illusion: helper -> checks status -> no-op
function helper() {
  if (true) { noAnnotation(1); }
}

const double = (x) => x * 2;
`;

const htmlSample = `<!-- @illusion: header_section -> renders page header with navigation -->
<header>
  <nav>
    <a href="/">Home</a>
  </nav>
</header>

<!-- @illusion: footer_section -> renders page footer with copyright -->
<footer>
  <p>&copy; 2026</p>
</footer>
`;

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    console.error(`  FAIL: ${label}${detail ? ' - ' + detail : ''}`);
  }
}

(async () => {
  console.log('=== Basic Analysis ===');
  const res = await analyzeDocument(sample, 'javascript');
  assert('grammar parse attempted', typeof res.grammarUsed === 'boolean');
  assert('cards returned', res.cards.length > 0);

  const missing = res.cards.filter((c) => c.label == null);
  assert('at least one missing annotation', missing.length > 0, `found ${missing.length} missing`);
  assert('parsed @illusion label with arrow notation', res.cards.some((c) => c.label && c.label.includes('->')));

  console.log('\n=== Call Graph ===');
  const mainCard = res.cards.find((c) => c.name === 'main');
  assert('main card found', !!mainCard, 'not found in cards');
  if (mainCard) {
    assert('main calls fetchData', mainCard.calls.includes('fetchData'), `got: ${mainCard.calls.join(',')}`);
    assert('main calls printResult', mainCard.calls.includes('printResult'), `got: ${mainCard.calls.join(',')}`);
    assert('main calls helper', mainCard.calls.includes('helper'), `got: ${mainCard.calls.join(',')}`);
  }

  const helperCard = res.cards.find((c) => c.name === 'helper');
  assert('helper card found', !!helperCard);
  if (helperCard) {
    assert('helper calls noAnnotation', helperCard.calls.includes('noAnnotation'), `got: ${helperCard.calls.join(',')}`);
  }

  console.log('\n=== Narrative Tree ===');
  if (mainCard && mainCard.narrative) {
    assert('main has narrative', true);
    assert('narrative uses tree format', mainCard.narrative.includes('├─') || mainCard.narrative.includes('└─'),
      `got:\n${mainCard.narrative}`);
    assert('narrative references fetchData', mainCard.narrative.includes('fetchData'));
    assert('narrative references printResult', mainCard.narrative.includes('printResult'));
    assert('narrative references helper', mainCard.narrative.includes('helper'));

    const treeLines = mainCard.narrative.split('\n');
    const depth1Lines = treeLines.filter(l => /^ {2}[├└]─ /.test(l));
    assert('main has 3 unique callees at depth 1', depth1Lines.length === 3,
      `found ${depth1Lines.length}:\n${mainCard.narrative}`);
  } else {
    assert('main has narrative', false);
  }

  if (helperCard && helperCard.narrative) {
    assert('helper narrative mentions missing annotation', helperCard.narrative.includes('\u26A0 missing annotation'));
  }

  const fetchDataCard = res.cards.find((c) => c.name === 'fetchData');
  if (fetchDataCard && fetchDataCard.narrative) {
    const lines = fetchDataCard.narrative.split('\n');
    assert('fetchData narrative is single line (no callees with labels)', lines.length <= 1,
      `got:\n${fetchDataCard.narrative}`);
  }

  console.log('\n=== Execution Flow ===');
  assert('executionFlow not empty', res.executionFlow.length > 0);
  assert('executionFlow includes fetchData', res.executionFlow.includes('fetchData'));

  console.log('\n=== HTML Comment Handling (fallback) ===');
  const htmlRes = await analyzeDocument(htmlSample, 'html');
  assert('html fallback returned cards', htmlRes.cards.length > 0, `got ${htmlRes.cards.length} cards`);
  if (htmlRes.cards.length > 0) {
    assert('html card has label', htmlRes.cards[0].label !== null);
    assert('html card parsed header_section', htmlRes.cards[0].label?.includes('header_section') === true);
  }

  console.log('\n=== Duplicate Name Warning ===');
  const dupSample = `// @preserve @illusion: process_data -> transforms input
function processData() { helper(); }

// @preserve @illusion: process_data_alt -> transforms input differently
function processData() { return 1; }

function helper() { return 2; }
`;
  const dupRes = await analyzeDocument(dupSample, 'javascript');
  const processCards = dupRes.cards.filter(c => c.name === 'processData');
  assert('duplicate names handled without crash', processCards.length > 0);

  console.log('\n=== Nested block annotation association ===');
  const nestedSample = `// @preserve @illusion: ringOnce -> plays one chord -> schedules next
function ringOnce() {
  if (ringtoneCtx) {
    // @illusion: <TODO: describe (try_statement)>
    try { ringtoneCtx.close(); } catch (_) {}
    ringtoneCtx = null;
  }
}

// @preserve @illusion: outer -> owns a nested try with no annotation
function outer() {
  if (true) {
    try { risky(); } catch (_) {}
  }
}
`;
  const nestedRes = await analyzeDocument(nestedSample, 'javascript');
  const annotatedTry = nestedRes.cards.find(
    (c) => c.kind === 'try_statement' && c.label && c.label.includes('TODO')
  );
  assert('nested try finds annotation placed above enclosing if', !!annotatedTry,
    `try cards: ${nestedRes.cards.filter(c => c.kind === 'try_statement').map(c => c.label).join(' | ')}`);
  const unannotatedTry = nestedRes.cards.find(
    (c) => c.kind === 'try_statement' && c.label == null
  );
  assert('nested try without own annotation stays missing (no inheritance from function)', !!unannotatedTry);

  console.log(`\n======= RESULTS: ${passed} passed, ${failed} failed =======`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Test suite error:', e);
  process.exit(1);
});
