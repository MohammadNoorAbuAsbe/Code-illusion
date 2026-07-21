#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { analyzeDocument } from './core/annotations';
import { languageIdFromPath } from './core/languages';
import { scaffoldProposals } from './core/scaffold';
import { analyzeProject, resolveInputs, ProjectAnalysis } from './core/project';
import { buildArtifacts, writeArtifacts, writeGitignore, computeGodNodes, computeSurprisingConnections, getDefaultOutDir } from './core/export';
import { installPlatform, allPlatforms, listInstalled } from './commands/installRules';
import { uninstallSingle, uninstallAll, purgeOutDir } from './commands/uninstallRules';
import { Card } from './core/types';

interface CliOptions {
  json: boolean;
  write: boolean;
  depth?: number;
  outDir?: string;
  platform?: string;
  force: boolean;
  purge: boolean;
}

interface Parsed {
  command: string;
  paths: string[];
  options: CliOptions;
}

const USAGE = `Code Illusion — headless analyzer

Usage:
  code-illusion <command> [path...] [options]

  <path> may be a file, a directory, or a glob pattern (e.g. "src/**/*.ts").
  Multiple paths are accepted; project-wide analysis is used when more than one
  file resolves, or when a directory/glob is supplied.

Commands:
  check      Report @illusion annotation coverage (annotated/total + missing blocks)
  story      Print the execution-flow narrative (unified across files in project mode)
  narrative  Print per-block call-graph narrative trees (JSON)
  analyze    Print the full analysis (JSON)
  scaffold   Print (or write) @illusion placeholder snippets for missing blocks
  generate   Write annotation health artifacts to code-illusion-out/ (COVERAGE.md, STORY.md, coverage.json)
             Includes god-node analysis, surprising connections, directory coverage, and priority gaps.
  hook       Install a pre-commit hook that auto-generates artifacts on commit
  install    Register @illusion agent rules with AI assistants (platforms: ${allPlatforms().map(p => p.name).join(', ')})
  uninstall  Remove installed agent rules from the project
  list       Show which agent rule platforms are installed
  serve      Start the MCP server for AI assistant integration

Options:
  --json         Emit machine-readable JSON
  --depth N      Override narrative depth (default: 2)
  --write        For 'scaffold': insert placeholders into the files in place
  --out DIR      For 'generate': output directory (default: code-illusion-out/)
  --platform     For 'install'/'uninstall': target platform name (default: all)
  --force        For 'install': overwrite existing files
  --purge        For 'uninstall': also delete code-illusion-out/
  --port N       For 'serve': HTTP port (default: 8080)
  --host ADDR    For 'serve': HTTP bind address (default: 127.0.0.1)
`;

// @illusion: fail -> prints error to stderr -> exits with code
function fail(message: string, code = 2): never {
  process.stderr.write(`code-illusion: ${message}\n`);
  process.exit(code);
}

// @illusion: parse_args -> splits options/positionals -> returns command + paths
function parseArgs(argv: string[]): Parsed {
  const options: CliOptions = { json: false, write: false, force: false, purge: false };
  const positionals: string[] = [];
  // @illusion: iterate_args -> walks argv -> parses options -> collects positionals
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') options.json = true;
    else if (a === '--write') options.write = true;
    else if (a === '--force') options.force = true;
    else if (a === '--purge') options.purge = true;
    else if (a === '--out') {
      options.outDir = argv[++i];
      if (!options.outDir) fail('--out requires a directory path');
    } else if (a === '--platform') {
      options.platform = argv[++i];
      if (!options.platform) fail('--platform requires a platform name');
    } else if (a === '--depth') {
      const v = argv[++i];
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 6) fail('--depth must be an integer between 1 and 6');
      options.depth = n;
    } else if (a.startsWith('--depth=')) {
      options.depth = Number(a.slice('--depth='.length));
    } else if (a.startsWith('-')) {
      fail(`unknown option: ${a}`);
    } else {
      positionals.push(a);
    }
  }
  const command = positionals[0];
  const paths = positionals.slice(1);
  if (!command) fail(USAGE);
  const validCommands = ['check', 'story', 'narrative', 'analyze', 'scaffold', 'generate', 'hook', 'install', 'uninstall', 'list', 'serve'];
  if (!validCommands.includes(command))
    fail(`unknown command: ${command}\n${USAGE}`);
  return { command, paths, options };
}

// @illusion: coverage -> counts annotated vs total -> lists missing blocks
function coverage(cards: Card[]) {
  const total = cards.length;
  const annotated = cards.filter((c) => c.label != null).length;
  const missing = cards
    .filter((c) => c.label == null)
    .map((c) => ({ kind: c.kind, name: c.name, startLine: c.startLine, endLine: c.endLine }));
  return { total, annotated, missing };
}

// @illusion: file_exists -> safe stat check -> returns boolean
function fileExists(p: string): boolean {
  // @illusion: ignore_stat_errors -> treats errors as non-existent
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

// @illusion: cli_main -> parses args -> handles hook/generate -> single-file or project analysis -> renders chosen command
async function main(): Promise<void> {
  const { command, paths, options } = parseArgs(process.argv.slice(2));

  if (command === 'hook') {
    const root = paths[0] ? path.resolve(paths[0]) : process.cwd();
    const { installPrecommitHook } = await import('./commands/installHook');
    const hookPath = installPrecommitHook(root);
    process.stdout.write(`code-illusion: installed pre-commit hook at ${hookPath}\n`);
    process.stdout.write(`  Artifacts in ${getDefaultOutDir()}/ will regenerate on every commit.\n`);
    return;
  }

  // @illusion: handle_install -> installs @illusion rules for one or all platforms -> prints results
  if (command === 'install') {
    const root = paths[0] ? path.resolve(paths[0]) : process.cwd();
    const platform = options.platform;
    if (platform) {
      const result = installPlatform(platform, root, options.force);
      // @illusion: print_install_errors -> writes any errors to stderr
      if (result.errors.length) {
        for (const e of result.errors) process.stderr.write(`  ${e}\n`);
      }
      if (result.filesWritten.length) {
        process.stdout.write(`code-illusion: installed ${platform} rules (${result.filesWritten.length} file(s))\n`);
        // @illusion: print_written_files -> lists each written file relative to root
        for (const w of result.filesWritten) process.stdout.write(`  wrote ${path.relative(root, w)}\n`);
        if (result.hooksWritten.length) {
          for (const h of result.hooksWritten) process.stdout.write(`  hook ${path.relative(root, h)}\n`);
        }
      }
    } else {
      let total = 0;
      // @illusion: install_all_platforms -> iterates all platforms -> accumulates file count
      for (const p of allPlatforms()) {
        const result = installPlatform(p.name, root, options.force);
        total += result.filesWritten.length;
        // @illusion: print_errors -> iterates errors -> writes each to stderr
        for (const e of result.errors) process.stderr.write(`  [${p.name}] ${e}\n`);
        // @illusion: print_written -> iterates written files -> writes each relative path
        for (const w of result.filesWritten) process.stdout.write(`  [${p.name}] wrote ${path.relative(root, w)}\n`);
      }
      process.stdout.write(`code-illusion: installed rules for ${allPlatforms().length} platform(s) (${total} file(s))\n`);
    }
    process.stdout.write('  Agents will now annotate with @illusion.\n');
    return;
  }

  // @illusion: handle_uninstall -> removes @illusion rules from project -> optionally purges code-illusion-out/
  if (command === 'uninstall') {
    const root = paths[0] ? path.resolve(paths[0]) : process.cwd();
    const platform = options.platform;
    let count: number;
    if (platform) {
      count = uninstallSingle(platform, root);
      process.stdout.write(`code-illusion: uninstalled ${platform} rules (${count} file(s) removed)\n`);
    } else {
      count = uninstallAll(root);
      process.stdout.write(`code-illusion: uninstalled all platform rules (${count} file(s) removed)\n`);
    }
    if (options.purge) {
      const purged = purgeOutDir(root);
      if (purged) process.stdout.write('  code-illusion-out/ deleted.\n');
    }
    return;
  }

  // @illusion: handle_list -> shows which platforms have installed rule files
  if (command === 'list') {
    const root = paths[0] ? path.resolve(paths[0]) : process.cwd();
    const installed = listInstalled(root);
    process.stdout.write('Code Illusion — installed platforms:\n');
    for (const [name, present] of installed) {
      const p = allPlatforms().find((pl) => pl.name === name);
      const label = p?.label ?? name;
      process.stdout.write(`  ${present ? '✅' : '  '} ${name.padEnd(12)} ${label}\n`);
    }
    return;
  }

  // @illusion: handle_serve -> starts the MCP server for AI assistant integration
  if (command === 'serve') {
    process.stdout.write('code-illusion: starting MCP server...\n');
    process.stdout.write('  Use --transport http --port 8080 for HTTP mode.\n');
    process.stdout.write('  (Full HTTP server support requires running dist/mcp-server.js directly with MCP Streamable HTTP)\n');
    await import('./mcp-server');
    return;
  }

  if (paths.length === 0) fail(`at least one <path> is required for command '${command}'\n${USAGE}`);

  const resolved = resolveInputs(paths);
  if (resolved.length === 0) fail(`no supported source files found for: ${paths.join(', ')}`);

  // Single-file mode when exactly one concrete file was requested (except generate always uses project mode).
  const singleFile = command !== 'generate' && paths.length === 1 && fileExists(paths[0]) && fs.statSync(paths[0]).isFile();

  if (singleFile) {
    await runSingleFile(command, path.resolve(paths[0]), options);
  } else {
    await runProject(command, resolved, options);
  }
}

// @illusion: run_single_file -> analyzes one file -> renders chosen command for single-file mode
async function runSingleFile(command: string, abs: string, options: CliOptions): Promise<void> {
  const source = fs.readFileSync(abs, 'utf8');
  const languageId = languageIdFromPath(abs);
  if (!languageId) fail(`unsupported language for: ${abs}`);
  const result = await analyzeDocument(source, languageId, abs, { narrativeDepth: options.depth });

  switch (command) {
    case 'check': {
      const cov = coverage(result.cards);
      if (options.json) {
        process.stdout.write(
          JSON.stringify(
            { language: result.language, grammarUsed: result.grammarUsed, ...cov, note: result.note ?? null },
            null,
            2
          ) + '\n'
        );
      } else {
        const mode = result.grammarUsed ? 'tree-sitter' : 'regex fallback';
        process.stdout.write(`Code Illusion — coverage for ${abs}\n`);
        process.stdout.write(`  language : ${result.language} (${mode})\n`);
        process.stdout.write(`  annotated: ${cov.annotated}/${cov.total}\n`);
        if (cov.missing.length === 0) {
          process.stdout.write('  100% annotated.\n');
        } else {
          process.stdout.write(`  missing (${cov.missing.length}):\n`);
          // @illusion: print_missing -> iterates missing blocks -> writes each to stdout
          for (const m of cov.missing) {
            const name = m.name ? ` ${m.name}` : '';
            process.stdout.write(`    - ${m.kind}${name} (lines ${m.startLine}-${m.endLine})\n`);
          }
        }
      }
      break;
    }
    case 'story': {
      if (options.json) {
        process.stdout.write(
          JSON.stringify({ executionFlow: result.executionFlow, note: result.note ?? null }, null, 2) + '\n'
        );
      } else {
        process.stdout.write(
          result.executionFlow
            ? result.executionFlow + '\n'
            : '(no execution flow — fallback mode or no entry points)\n'
        );
      }
      break;
    }
    case 'narrative': {
      const narratives = result.cards
        .filter((c) => c.narrative)
        .map((c) => ({ name: c.name, kind: c.kind, narrative: c.narrative }));
      process.stdout.write(JSON.stringify(narratives, null, 2) + '\n');
      break;
    }
    case 'analyze': {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      break;
    }
    case 'scaffold': {
      const proposals = scaffoldProposals(result.source, result.cards, result.language);
      await writeOrPrintScaffold(proposals, abs, result.source, options);
      break;
    }
  }
}

// @illusion: run_project -> runs unified analysis -> renders command across all files
async function runProject(command: string, files: string[], options: CliOptions): Promise<void> {
  const pa: ProjectAnalysis = await analyzeProject(files, { narrativeDepth: options.depth });
  // @illusion: out -> writes text to stdout -> shortcuts process.stdout.write
  const out = (s: string) => process.stdout.write(s);

  switch (command) {
    case 'check': {
      const { total, annotated, missing } = pa.coverage;
      if (options.json) {
        out(JSON.stringify({ files: pa.files.length, total, annotated, missing }, null, 2) + '\n');
      } else {
        out(`Code Illusion — project coverage (${pa.files.length} file(s))\n`);
        out(`  annotated: ${annotated}/${total} (${total === 0 ? 100 : Math.round((annotated / total) * 100)}%)\n`);
        if (missing.length === 0) {
          out('  100% annotated.\n');
        } else {
          out(`  missing (${missing.length}):\n`);
          // @illusion: print_missing_blocks -> iterates missing -> writes each with file path
          for (const m of missing) {
            const name = m.name ? ` ${m.name}` : '';
            out(`    - ${m.file}: ${m.kind}${name} (lines ${m.startLine}-${m.endLine})\n`);
          }
        }
      }
      break;
    }
    case 'story': {
      if (options.json) {
        out(JSON.stringify({ executionFlow: pa.executionFlow }, null, 2) + '\n');
      } else {
        out(pa.executionFlow ? pa.executionFlow + '\n' : '(no execution flow — fallback mode or no entry points)\n');
      }
      break;
    }
    case 'narrative': {
      const narratives = pa.allCards
        .filter((c) => pa.narratives.get(c.id))
        .map((c) => ({ file: c.filePath, name: c.name, kind: c.kind, narrative: pa.narratives.get(c.id) }));
      out(JSON.stringify(narratives, null, 2) + '\n');
      break;
    }
    case 'analyze': {
      out(
        JSON.stringify(
          {
            files: pa.files,
            coverage: pa.coverage,
            edges: pa.edges,
            entryPointIds: pa.entryPointIds,
            executionFlow: pa.executionFlow,
          },
          null,
          2
        ) + '\n'
      );
      break;
    }
    case 'scaffold': {
      let totalInserted = 0;
      // @illusion: iterate_project_files -> walks each file -> scaffolds missing annotations
      for (const entry of pa.files) {
        const proposals = scaffoldProposals(entry.result.source, entry.result.cards, entry.result.language);
        if (options.write) {
          totalInserted += proposals.length;
          let text = entry.result.source;
          // @illusion: insert_proposals -> walks each placeholder -> splices into source text
          for (const p of proposals) {
            const lines = text.split('\n');
            const indent = (lines[p.line - 1] ?? '').match(/^\s*/)?.[0] ?? '';
            lines.splice(p.line - 1, 0, indent + p.snippet);
            text = lines.join('\n');
          }
          fs.writeFileSync(entry.filePath, text);
        } else if (options.json) {
          out(
            JSON.stringify(
              proposals.map((p) => ({ file: entry.filePath, ...p })),
              null,
              2
            ) + '\n'
          );
        } else {
          // @illusion: print_proposals -> prints each placeholder line to stdout
          for (const p of proposals) out(`${entry.filePath}: L${p.line}: ${p.snippet}\n`);
        }
      }
      if (options.write)
        out(`code-illusion: inserted ${totalInserted} placeholder(s) across ${pa.files.length} file(s)\n`);
      else if (!options.json) out(`\nRun with --write to insert placeholders into the files.\n`);
      break;
    }
    // @illusion: generate_command -> builds artifacts -> writes code-illusion-out/ -> prints summary
    case 'generate': {
      const artifacts = buildArtifacts({
        files: pa.files,
        allCards: pa.allCards,
        edges: pa.edges,
        entryPointIds: pa.entryPointIds,
        executionFlow: pa.executionFlow,
      });
      const written = writeArtifacts(artifacts, options.outDir);
      writeGitignore(options.outDir);
      const { total, annotated } = pa.coverage;
      const pct = total === 0 ? 100 : Math.round((annotated / total) * 100);
      const outDir = options.outDir ? path.resolve(options.outDir) : getDefaultOutDir();
      out(`code-illusion: generated ${written.length} artifact(s) in ${outDir}\n`);
      out(`  coverage: ${annotated}/${total} (${pct}%)\n`);
      out(`  god nodes: ${computeGodNodes(pa.allCards, pa.edges).length > 0 ? computeGodNodes(pa.allCards, pa.edges)[0].inDegree + ' max in-degree' : 'none'}\n`);
      out(`  surprising connections: ${computeSurprisingConnections(pa.allCards, pa.edges).length}\n`);
      break;
    }
  }
}

// @illusion: write_or_print_scaffold -> inserts or prints @illusion placeholder snippets
async function writeOrPrintScaffold(
  proposals: { line: number; snippet: string }[],
  abs: string,
  source: string,
  options: CliOptions
): Promise<void> {
  if (options.write) {
    let text = source;
    // @illusion: insert_proposals -> iterates placeholders -> inserts each into source text
    for (const p of proposals) {
      const lines = text.split('\n');
      const indent = (lines[p.line - 1] ?? '').match(/^\s*/)?.[0] ?? '';
      lines.splice(p.line - 1, 0, indent + p.snippet);
      text = lines.join('\n');
    }
    fs.writeFileSync(abs, text);
    process.stdout.write(`code-illusion: inserted ${proposals.length} placeholder(s) into ${abs}\n`);
  } else if (options.json) {
    process.stdout.write(JSON.stringify(proposals, null, 2) + '\n');
  } else {
    // @illusion: print_proposals -> iterates proposals -> writes each line:snippet to stdout
    for (const p of proposals) process.stdout.write(`L${p.line}: ${p.snippet}\n`);
    if (proposals.length === 0) process.stdout.write('(nothing to scaffold)\n');
    else process.stdout.write(`\nRun with --write to insert ${proposals.length} placeholder(s) into the file.\n`);
  }
}

main().catch((e) => {
  process.stderr.write(`code-illusion error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
