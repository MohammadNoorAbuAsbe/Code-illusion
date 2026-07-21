import * as fs from 'fs';
import * as path from 'path';
import * as WTS from 'web-tree-sitter';
import { TSNode } from './types';

const ns: Record<string, unknown> =
  (WTS as unknown as { default?: Record<string, unknown> }).default ?? (WTS as unknown as Record<string, unknown>);
const ParserCtor: {
  new (): { setLanguage(lang: unknown): void; parse(text: string): { rootNode: TSNode } };
  init(opts?: { locateFile: (file: string) => string }): Promise<void>;
} = (ns.Parser ?? ns) as never;
const Language: { load(path: string): Promise<unknown> } = ns.Language as never;

let initialized = false;
const languageCache = new Map<string, unknown>();
const parserCache = new Map<string, unknown>();

// @illusion: grammars_dir -> returns the bundled grammars directory path
export function grammarsDir(): string {
  return path.join(__dirname, 'grammars');
}

// @illusion: init_parser -> loads tree-sitter wasm runtime once
export async function initParser(): Promise<void> {
  if (initialized) {
    return;
  }
  await ParserCtor.init({
    locateFile: (file: string) => path.join(grammarsDir(), file),
  });
  initialized = true;
}

// @illusion: load_language -> loads + caches a grammar wasm -> returns language
export async function loadLanguage(grammar: string): Promise<unknown> {
  if (languageCache.has(grammar)) {
    return languageCache.get(grammar);
  }
  const wasmPath = path.join(grammarsDir(), `tree-sitter-${grammar}.wasm`);
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`Grammar not available: ${grammar} (${wasmPath})`);
  }
  const lang = await Language.load(wasmPath);
  languageCache.set(grammar, lang);
  return lang;
}

// @illusion: parse -> parses text with cached grammar+parser -> returns tree
export async function parse(text: string, grammar: string): Promise<{ rootNode: TSNode }> {
  await initParser();
  const lang = await loadLanguage(grammar);
  let parser = parserCache.get(grammar) as
    { setLanguage(lang: unknown): void; parse(text: string): { rootNode: TSNode } } | undefined;
  if (!parser) {
    parser = new ParserCtor();
    parserCache.set(grammar, parser);
  }
  parser.setLanguage(lang);
  const tree = parser.parse(text);
  return tree;
}
