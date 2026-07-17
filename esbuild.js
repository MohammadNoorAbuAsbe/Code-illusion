const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

const WATCH = process.argv.includes('--watch');

// @preserve @illusion: copy_file_safe -> copies file if source exists -> creates parent dirs
function copyFileSafe(from, to) {
  if (fs.existsSync(from)) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    console.log('copied', path.relative(ROOT, to));
  } else {
    console.warn('MISSING (skipped):', from);
  }
}

// @preserve @illusion: copy_grammars -> copies tree-sitter runtime and grammar wasm files to dist
async function copyGrammars() {
  const wtsRoot = path.dirname(require.resolve('web-tree-sitter'));
  const runtimeWasm = path.join(wtsRoot, 'tree-sitter.wasm');
  copyFileSafe(runtimeWasm, path.join(DIST, 'grammars', 'tree-sitter.wasm'));

  const vtsRoot = path.dirname(require.resolve('@vscode/tree-sitter-wasm'));
  const srcWasm = vtsRoot;
  const wanted = [
    'tree-sitter-javascript.wasm',
    'tree-sitter-typescript.wasm',
    'tree-sitter-tsx.wasm',
    'tree-sitter-python.wasm',
    'tree-sitter-java.wasm',
    'tree-sitter-c-sharp.wasm',
    'tree-sitter-go.wasm',
    'tree-sitter-rust.wasm'
  ];
  // @preserve @illusion: copy_grammar_files -> iterate grammar list -> copy each wasm
  for (const f of wanted) {
    copyFileSafe(path.join(srcWasm, f), path.join(DIST, 'grammars', f));
  }
}

// @preserve @illusion: copy_webview_assets -> copies CSS to dist/webview
async function copyWebviewAssets() {
  copyFileSafe(
    path.join(ROOT, 'src', 'webview', 'ui', 'styles.css'),
    path.join(DIST, 'webview', 'styles.css')
  );
}

// @preserve @illusion: copy_agent_rules -> copies .md/.mdc rule files from src to dist/agent-rules
async function copyAgentRules() {
  const srcDir = path.join(ROOT, 'src', 'agent-rules');
  const destDir = path.join(DIST, 'agent-rules');
  if (!fs.existsSync(srcDir)) {
    return;
  }
  // @preserve @illusion: iterate_agent_rules -> read src dir -> copy matching files
  for (const f of fs.readdirSync(srcDir)) {
    if (f.endsWith('.md') || f.endsWith('.mdc')) {
      copyFileSafe(path.join(srcDir, f), path.join(destDir, f));
    }
  }
}

// @preserve @illusion: main_build -> builds 3 bundles (extension, webview, test) -> copies assets
async function main() {
  fs.mkdirSync(DIST, { recursive: true });

  const extensionCtx = {
    entryPoints: [path.join(ROOT, 'src', 'extension.ts')],
    bundle: true,
    outfile: path.join(DIST, 'extension.js'),
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: ['vscode', 'web-tree-sitter', '@vscode/tree-sitter-wasm'],
    sourcemap: true,
    logLevel: 'info',
    legalComments: 'inline'
  };

  const webviewCtx = {
    entryPoints: [path.join(ROOT, 'src', 'webview', 'ui', 'main.ts')],
    bundle: true,
    outfile: path.join(DIST, 'webview', 'main.js'),
    platform: 'browser',
    target: 'es2020',
    format: 'iife',
    sourcemap: true,
    logLevel: 'info',
    legalComments: 'inline'
  };

  const testCtx = {
    entryPoints: [path.join(ROOT, 'src', 'test-core.ts')],
    bundle: true,
    outfile: path.join(DIST, 'test-core.js'),
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: ['web-tree-sitter', '@vscode/tree-sitter-wasm'],
    sourcemap: true,
    logLevel: 'info',
    legalComments: 'inline'
  };

  if (WATCH) {
    const extWatch = await esbuild.context(extensionCtx);
    const webWatch = await esbuild.context(webviewCtx);
    await extWatch.watch();
    await webWatch.watch();
    await copyGrammars();
    await copyWebviewAssets();
    await copyAgentRules();
    console.log('watching...');
  } else {
    await esbuild.build(extensionCtx);
    await esbuild.build(webviewCtx);
    await esbuild.build(testCtx);
    await copyGrammars();
    await copyWebviewAssets();
    await copyAgentRules();
    console.log('build complete');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
