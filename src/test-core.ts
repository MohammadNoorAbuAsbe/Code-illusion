import { analyzeDocument } from './core/annotations';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

  console.log('\n=== Closure / callback boundary (Bug A) ===');
  const closureSample = `// @illusion: outer -> iterates -> wires callback
function outer() {
  items.forEach(x => inner(x));
}
// @illusion: inner -> does work
function inner(v) { return v; }
`;
  const closureRes = await analyzeDocument(closureSample, 'javascript');
  const outerCard = closureRes.cards.find((c) => c.name === 'outer');
  assert('outer does not attribute callback callee as a direct call', !!outerCard && !outerCard.calls.includes('inner'),
    `got: ${outerCard?.calls.join(',')}`);
  if (outerCard && outerCard.narrative) {
    assert('outer narrative does not list inner (it is inside a callback)', !outerCard.narrative.includes('inner'),
      `got:\n${outerCard.narrative}`);
  }

  console.log('\n=== Cross-file external callees (Bug B) ===');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-xfile-'));
  try {
    const utilPath = path.join(tmpDir, 'util.js');
    fs.writeFileSync(utilPath, `// @illusion: loadContacts -> reads storage -> returns array
export function loadContacts() { return normalize(); }
// @illusion: normalize -> lowercases entries
function normalize() { return []; }
`);
    const mainPath = path.join(tmpDir, 'main.js');
    const mainSrc = `import { loadContacts } from './util.js';
// @illusion: render -> draws list -> calls loadContacts
function render() {
  const list = loadContacts();
  return list;
}`;
    fs.writeFileSync(mainPath, mainSrc);

    const xRes = await analyzeDocument(mainSrc, 'javascript', mainPath);
    const renderCard = xRes.cards.find((c) => c.name === 'render');
    assert('render card found', !!renderCard);
    if (renderCard && renderCard.narrative) {
      assert('render narrative includes external loadContacts label', renderCard.narrative.includes('reads storage'),
        `got:\n${renderCard.narrative}`);
      assert('external leaf is prefixed with reference glyph', renderCard.narrative.includes('↪'),
        `got:\n${renderCard.narrative}`);
      assert('narrative does NOT recurse into util.js internals (normalize)', !renderCard.narrative.includes('lowercases'),
        `got:\n${renderCard.narrative}`);
    } else {
      assert('render narrative present', false, 'missing narrative');
    }
    assert('executionFlow includes external label', xRes.executionFlow.includes('reads storage'),
      `got:\n${xRes.executionFlow}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('\n=== Bare / package import stays graceful (Bug B) ===');
  const pkgSample = `import { thing } from 'somepkg';
// @illusion: useIt -> calls package fn
function useIt() { return thing(); }`;
  const pkgRes = await analyzeDocument(pkgSample, 'javascript', path.join(os.tmpdir(), 'ci-pkg-never.js'));
  const useItCard = pkgRes.cards.find((c) => c.name === 'useIt');
  assert('analysis does not crash on package imports', !!useItCard, 'useIt card missing');

  console.log(`\n======= RESULTS: ${passed} passed, ${failed} failed =======`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Test suite error:', e);
  process.exit(1);
});
