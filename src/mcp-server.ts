#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { analyzeDocument } from './core/annotations';
import { languageIdFromPath } from './core/languages';
import { scaffoldProposals } from './core/scaffold';
import { analyzeProject, resolveInputs, ProjectAnalysis } from './core/project';
import { buildArtifacts, writeArtifacts, writeGitignore, computeGodNodes, computeSurprisingConnections } from './core/export';
import { Card } from './core/types';

const server = new McpServer({ name: 'code-illusion', version: '0.2.0' });

interface Scope {
  file?: string;
  directory?: string;
  pattern?: string;
  depth?: number;
}

// @illusion: analyze_scope -> resolves file/dir/glob -> runs single or project analysis
async function analyzeScope(scope: Scope): Promise<ProjectAnalysis> {
  if (scope.directory || scope.pattern) {
    const inputs = [scope.directory, scope.pattern].filter((x): x is string => !!x);
    const resolved = resolveInputs(inputs);
    if (resolved.length === 0) throw new Error(`No supported source files found for: ${inputs.join(', ')}`);
    return analyzeProject(resolved, { narrativeDepth: scope.depth });
  }
  if (scope.file) {
    const abs = path.resolve(scope.file);
    if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`);
    const source = fs.readFileSync(abs, 'utf8');
    const languageId = languageIdFromPath(abs);
    if (!languageId) throw new Error(`Unsupported language for: ${abs}`);
    const result = await analyzeDocument(source, languageId, abs, { narrativeDepth: scope.depth });
    result.cards.forEach((c) => {
      c.filePath = abs;
    });
    return {
      files: [{ filePath: abs, result }],
      allCards: result.cards,
      edges: [],
      entryPointIds: result.cards.filter((c) => c.label != null).map((c) => c.id),
      externalCards: new Map(),
      narratives: new Map(result.cards.filter((c) => c.narrative).map((c) => [c.id, c.narrative as string])),
      executionFlow: result.executionFlow,
      coverage: aggregate(result.cards),
    };
  }
  throw new Error('Provide one of: file, directory, or pattern');
}

// @illusion: aggregate -> sums annotated/total -> lists missing blocks with file path
function aggregate(cards: Card[]) {
  const total = cards.length;
  const annotated = cards.filter((c) => c.label != null).length;
  const missing = cards
    .filter((c) => c.label == null)
    .map((c) => ({
      file: c.filePath ?? '(unknown)',
      kind: c.kind,
      name: c.name,
      startLine: c.startLine,
      endLine: c.endLine,
    }));
  return { total, annotated, missing };
}

// @illusion: wrap_response -> formats body as MCP text content -> returns content block
function text(body: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body, null, 2) }] };
}

const scopeSchema = {
  file: z.string().optional().describe('Path to a single source file.'),
  directory: z.string().optional().describe('Directory to analyze recursively.'),
  pattern: z.string().optional().describe('Glob pattern, e.g. "src/**/*.ts".'),
  depth: z.number().int().min(1).max(6).optional().describe('Narrative depth (1-6).'),
};

server.registerTool(
  'check_coverage',
  {
    title: 'Check @illusion annotation coverage',
    description:
      'Analyze file(s) and report which blocks are missing @illusion annotations. Supports file, directory, or glob pattern.',
    inputSchema: scopeSchema,
  },
  async (scope) => {
    const pa = await analyzeScope(scope);
    const { total, annotated, missing } = pa.coverage;
    const pct = total === 0 ? 100 : Math.round((annotated / total) * 100);
    const godNodes = computeGodNodes(pa.allCards, pa.edges);
    const priorityGaps = pa.allCards.filter((c) => c.label == null && pa.edges.some((e) => e.calleeCardId === c.id));
    const summary = `Coverage: ${annotated}/${total} (${pct}%). ` +
      (pct === 100 ? '100% annotated — no gaps.' :
        priorityGaps.length > 0 ? `${priorityGaps.length} called-but-unannotated block(s) break narrative trees. See detailed JSON below.` :
        `${missing.length} unannotated block(s). See detailed JSON below.`) +
      (godNodes.length > 0 ? ` Top cited: ${godNodes[0].card.name ?? godNodes[0].card.kind} (called by ${godNodes[0].inDegree}).` : '');
    return text({ summary, files: pa.files.length, total, annotated, percent: pct, missingBlocks: missing.length, missing });
  }
);

server.registerTool(
  'get_story',
  {
    title: 'Get execution-flow story',
    description:
      'Return the execution-flow narrative. For directory/pattern scopes this is the unified cross-file story.',
    inputSchema: scopeSchema,
  },
  async (scope) => {
    const pa = await analyzeScope(scope);
    return text(pa.executionFlow || '(no execution flow — fallback mode or no entry points)');
  }
);

server.registerTool(
  'get_narrative',
  {
    title: 'Get per-block narrative trees',
    description:
      'Return each annotated block with its call-graph narrative tree (unified across files when a scope is given).',
    inputSchema: scopeSchema,
  },
  async (scope) => {
    const pa = await analyzeScope(scope);
    const narratives = pa.allCards
      .filter((c) => pa.narratives.get(c.id))
      .map((c) => ({ file: c.filePath, name: c.name, kind: c.kind, narrative: pa.narratives.get(c.id) }));
    return text(narratives);
  }
);

server.registerTool(
  'scaffold_missing',
  {
    title: 'Propose @illusion annotations',
    description: 'Return @illusion placeholder snippets for blocks missing annotations (file, directory, or pattern).',
    inputSchema: { file: z.string().optional(), directory: z.string().optional(), pattern: z.string().optional() },
  },
  async ({ file, directory, pattern }) => {
    const pa = await analyzeScope({ file, directory, pattern });
    const all = pa.files.map((entry) => ({
      file: entry.filePath,
      proposals: scaffoldProposals(entry.result.source, entry.result.cards, entry.result.language),
    }));
    return text(all);
  }
);

// @illusion: generate_artifacts_tool -> analyzes scope -> builds artifacts -> writes code-illusion-out/ -> returns summary
server.registerTool(
  'generate_artifacts',
  {
    title: 'Generate annotation health artifacts',
    description:
      'Analyze file(s) and write annotation health artifacts (COVERAGE.md, STORY.md, coverage.json) in code-illusion-out/. Includes god-node analysis, surprising connections, directory coverage, and priority gaps. Returns a summary of what was written.',
    inputSchema: {
      file: z.string().optional().describe('Path to a single source file.'),
      directory: z.string().optional().describe('Directory to analyze recursively.'),
      pattern: z.string().optional().describe('Glob pattern, e.g. "src/**/*.ts".'),
      depth: z.number().int().min(1).max(6).optional().describe('Narrative depth (1-6).'),
      outDir: z.string().optional().describe('Output directory (default: code-illusion-out/).'),
    },
  },
  async ({ file, directory, pattern, depth, outDir }) => {
    const pa = await analyzeScope({ file, directory, pattern, depth });
    const artifacts = buildArtifacts({
      files: pa.files,
      allCards: pa.allCards,
      edges: pa.edges,
      entryPointIds: pa.entryPointIds,
      executionFlow: pa.executionFlow,
    });
    const written = writeArtifacts(artifacts, outDir);
    writeGitignore(outDir);
    const { total, annotated } = pa.coverage;
    const pct = total === 0 ? 100 : Math.round((annotated / total) * 100);
    const godNodes = computeGodNodes(pa.allCards, pa.edges);
    const surprisingConns = computeSurprisingConnections(pa.allCards, pa.edges);
    return text({
      summary: `Generated ${written.length} artifact(s). Coverage: ${annotated}/${total} (${pct}%).` +
        (godNodes.length > 0 ? ` Top god node: ${godNodes[0].card.name ?? godNodes[0].card.kind} (in-degree ${godNodes[0].inDegree}).` : '') +
        (surprisingConns.length > 0 ? ` ${surprisingConns.length} cross-module edge(s).` : ''),
      artifacts: written,
      outDir: written.length > 0 ? path.dirname(written[0]) : '',
      summaryData: {
        files: pa.files.length,
        totalBlocks: total,
        annotatedBlocks: annotated,
        annotPercent: pct,
      },
    });
  }
);

const transport = new StdioServerTransport();
server.connect(transport).catch((e) => {
  process.stderr.write(`code-illusion-mcp error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
