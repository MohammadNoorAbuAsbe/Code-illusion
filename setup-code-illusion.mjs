#!/usr/bin/env node
// @illusion: setup_code_illusion -> installs + builds -> registers MCP -> copies agent rules
// One-shot setup so agents can use Code Illusion immediately in a project.
//
// Usage:
//   node setup-code-illusion.mjs [--project <dir>] [--client opencode|claude|both] [--vscode] [--skip-install] [--skip-build]
//
//   --project <dir>   Target project to copy the @illusion annotation standard into (default: cwd).
//   --client          Which MCP client config to register in (default: opencode).
//   --vscode          Also package + install the VS Code extension (best-effort).
//   --skip-install    Skip `npm install`.
//   --skip-build      Skip `npm run build`.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO = path.dirname(fileURLToPath(import.meta.url));
const DIST_MCP = path.join(REPO, 'dist', 'mcp-server.js');
const DIST_CLI = path.join(REPO, 'dist', 'cli.js');
const RULES_SRC = path.join(REPO, 'dist', 'agent-rules');

const RULE_FILES = [
  { from: 'AGENTS.md', to: 'AGENTS.md' },
  { from: 'CLAUDE.md', to: 'CLAUDE.md' },
  { from: 'copilot-instructions.md', to: path.join('.github', 'copilot-instructions.md') },
  { from: 'code-illusion.mdc', to: path.join('.cursor', 'rules', 'code-illusion.mdc') },
];

function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  if (r.status !== 0) throw new Error(`Command failed (exit ${r.status}): ${cmd} ${args.join(' ')}`);
}

function parseArgs(argv) {
  const a = { project: process.cwd(), client: 'opencode', vscode: false, skipInstall: false, skipBuild: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--project') a.project = path.resolve(argv[++i]);
    else if (x === '--client') a.client = argv[++i];
    else if (x === '--vscode') a.vscode = true;
    else if (x === '--skip-install') a.skipInstall = true;
    else if (x === '--skip-build') a.skipBuild = true;
    else throw new Error(`Unknown flag: ${x}`);
  }
  return a;
}

// Minimal JSONC stripper that respects strings (so https:// in $schema survives).
function stripJsonc(text) {
  let out = '';
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inStr) {
      out += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else {
      out += c;
    }
  }
  return out;
}

function readJson(path_) {
  if (!fs.existsSync(path_)) return {};
  const raw = fs.readFileSync(path_, 'utf8');
  return JSON.parse(stripJsonc(raw));
}

function writeJson(path_, obj) {
  fs.mkdirSync(path.dirname(path_), { recursive: true });
  fs.writeFileSync(path_, JSON.stringify(obj, null, 2) + '\n');
}

function registerOpencode() {
  const dir = path.join(os.homedir(), '.config', 'opencode');
  const candidates = ['opencode.jsonc', 'opencode.json'].map((f) => path.join(dir, f));
  let cfgPath = candidates.find((f) => fs.existsSync(f)) ?? candidates[0];
  const cfg = readJson(cfgPath);
  cfg.$schema = cfg.$schema ?? 'https://opencode.ai/config.json';
  cfg.mcp = cfg.mcp ?? {};
  cfg.mcp['code-illusion'] = {
    type: 'local',
    command: [process.execPath, DIST_MCP],
    enabled: true,
  };
  writeJson(cfgPath, cfg);
  console.log(`  registered MCP in ${cfgPath}`);
}

function registerClaude() {
  const dir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Claude');
  const cfgPath = path.join(dir, 'claude_desktop_config.json');
  const cfg = readJson(cfgPath);
  cfg.mcpServers = cfg.mcpServers ?? {};
  cfg.mcpServers['code-illusion'] = {
    command: process.execPath,
    args: [DIST_MCP],
  };
  writeJson(cfgPath, cfg);
  console.log(`  registered MCP in ${cfgPath}`);
}

function copyRules(projectDir) {
  if (!fs.existsSync(RULES_SRC)) throw new Error('agent-rules not found in dist — run build first.');
  const written = [];
  const skipped = [];
  for (const rf of RULE_FILES) {
    const from = path.join(RULES_SRC, rf.from);
    if (!fs.existsSync(from)) continue;
    const to = path.join(projectDir, rf.to);
    if (fs.existsSync(to)) {
      skipped.push(rf.to);
      continue;
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    written.push(rf.to);
  }
  if (written.length) console.log(`  wrote agent rules -> ${written.join(', ')}`);
  if (skipped.length) console.log(`  skipped existing -> ${skipped.join(', ')} (delete to regenerate)`);
  if (!written.length && !skipped.length) console.log('  no rule templates available');
}

function installVscode() {
  try {
    run('npx', ['-y', '@vscode/vsce', 'package', '--no-dependencies']);
    const vsix = fs
      .readdirSync(REPO)
      .filter((f) => f.endsWith('.vsix'))
      .sort((a, b) => fs.statSync(path.join(REPO, b)).mtimeMs - fs.statSync(path.join(REPO, a)).mtimeMs)[0];
    if (!vsix) throw new Error('no .vsix produced by vsce package');
    run('code', ['--install-extension', path.join(REPO, vsix), '--force']);
  } catch (e) {
    console.warn(`  VS Code install skipped: ${e.message}`);
    console.warn('  Package the extension manually: npx @vscode/vsce package && code --install-extension *.vsix');
  }
}

try {
  const a = parseArgs(process.argv.slice(2));

  console.log('=== Code Illusion setup ===');
  if (!a.skipInstall) {
    console.log('\n[1/5] Installing dependencies');
    run('npm', ['install']);
  }

  console.log('\n[2/5] Building (CLI + MCP server + agent-rules)');
  if (!a.skipBuild) run('npm', ['run', 'build']);
  if (!fs.existsSync(DIST_MCP)) throw new Error('dist/mcp-server.js missing after build.');

  console.log('\n[3/5] Registering MCP server');
  if (a.client === 'opencode' || a.client === 'both') registerOpencode();
  if (a.client === 'claude' || a.client === 'both') registerClaude();

  console.log('\n[4/5] Copying @illusion annotation standard into project');
  console.log(`  target: ${a.project}`);
  copyRules(a.project);

  if (a.vscode) {
    console.log('\n[5/5] Packaging + installing VS Code extension');
    installVscode();
  } else {
    console.log('\n[5/5] Skipping VS Code extension install (pass --vscode to do it)');
  }

  console.log('\n=== Done ===');
  console.log('Agents can now use Code Illusion:');
  console.log(`  CLI : node ${DIST_CLI} check|story|narrative|analyze|scaffold "<path|dir|glob>"`);
  console.log('  MCP : tools check_coverage / get_story / get_narrative / scaffold_missing');
  console.log('Next: restart opencode (to load the new MCP server), then open the target project.');
} catch (e) {
  console.error(`\nsetup failed: ${e.message}`);
  process.exit(1);
}
