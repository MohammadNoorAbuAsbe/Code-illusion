import * as fs from 'fs';
import * as path from 'path';
import { TSNode } from './types';
import { parse } from './parser';
import { extractBlocks } from './blocks';
import { precedingComments, extractLabel } from './annotations';
import { getLanguageConfig, languageIdFromPath } from './languages';

export interface ImportRef {
  file: string;
  exported: string;
}

const EXT_CANDIDATES = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java', '.cs', '.go', '.rs'];

// @illusion: resolve_module_file -> appends extension/index candidates -> returns existing path
function resolveModuleFile(abs: string): string {
  // @illusion: guard_stat -> ignores missing path -> falls back to extension candidates
  try {
    if (fs.statSync(abs).isFile()) return abs;
  } catch {
    // fall through to extension candidates
  }
  // @illusion: try_extensions -> walks ext candidates -> returns first existing file
  for (const ext of EXT_CANDIDATES) {
    const withExt = abs + ext;
    if (fs.existsSync(withExt)) return withExt;
  }
  const index = path.join(abs, 'index.ts');
  if (fs.existsSync(index)) return index;
  return abs;
}

// @illusion: extract_imports -> walks import declarations -> maps local name -> {file, exported}
export function extractImports(tree: { rootNode: TSNode }, sourceDir: string): Map<string, ImportRef> {
  const result = new Map<string, ImportRef>();

  // @illusion: visit -> recurses tree -> resolves relative named imports
  const visit = (n: TSNode) => {
    if (n.type === 'import_statement' || n.type === 'import_declaration') {
      const srcNode = n.childForFieldName('source');
      if (srcNode) {
        const spec = srcNode.text.replace(/^['"]|['"]$/g, '');
        if (spec.startsWith('.')) {
          const abs = resolveModuleFile(path.resolve(sourceDir, spec));
          // import_specifier nodes live nested under import_clause -> named_imports.
          // @illusion: collect -> recurses specifiers -> maps local -> {file, exported}
          const collect = (node: TSNode) => {
            // @illusion: scan_specifiers -> walks child nodes -> finds import specifiers
            for (const c of node.children) {
              if (c.type === 'import_specifier') {
                const nameNode = c.childForFieldName('name');
                const aliasNode = c.childForFieldName('alias');
                const exported = nameNode?.text ?? '';
                const local = aliasNode?.text ?? exported;
                if (exported && local) result.set(local, { file: abs, exported });
              } else if (c.type !== 'import_statement' && c.type !== 'import_declaration') {
                collect(c);
              }
            }
          };
          collect(n);
          // Default (`import x from`) and namespace (`import * as ns`) imports are
          // skipped in v1 -- only named imports with relative specifiers are resolved.
        }
      }
    }
    // @illusion: recurse_children -> walks siblings -> continues import scan
    for (const c of n.children) visit(c);
  };

  visit(tree.rootNode);
  return result;
}

// Cache of parsed-target-file data, keyed by path + mtime.
interface FileData {
  labels: Map<string, string>;
  imports: Map<string, ImportRef>;
}
const fileDataCache = new Map<string, FileData | null>();

// @illusion: load_file_data -> parses one target file -> returns labels + imports
async function loadFileData(file: string): Promise<FileData | null> {
  const lang = languageIdFromPath(file);
  if (!lang) return null;
  const cfg = getLanguageConfig(lang);
  if (!cfg || !cfg.grammar) return null;

  let stat: fs.Stats;
  // @illusion: guard_stat -> ignores unreadable file -> returns null
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }

  const cacheKey = `${file}:${stat.mtimeMs}`;
  const cached = fileDataCache.get(cacheKey);
  if (cached) return cached;

  let src: string;
  // @illusion: guard_read -> ignores unreadable file -> returns null
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }

  // @illusion: guard_parse -> ignores parse failure -> returns null
  try {
    const tree = await parse(src, cfg.grammar);
    const blocks = extractBlocks(tree);
    const labels = new Map<string, string>();
    for (const b of blocks) {
      if (b.name) {
        const label = extractLabel(precedingComments(b.node));
        if (label) labels.set(b.name, label);
      }
    }
    const imports = extractImports(tree, path.dirname(file));
    const fd: FileData = { labels, imports };
    fileDataCache.set(cacheKey, fd);
    return fd;
  } catch {
    return null;
  }
}

// @illusion: resolve_external_labels_recursive -> walks import chain -> builds transitive label map
async function resolveExternalLabelsRecursive(
  importMap: Map<string, ImportRef>,
  depth: number,
  maxDepth: number,
  visited: Set<string>,
  result: Map<string, string>
): Promise<void> {
  if (depth > maxDepth) return;

  for (const [local, { file, exported }] of importMap) {
    if (result.has(local)) continue;
    const fileKey = `${file}:${exported}`;
    if (visited.has(fileKey)) continue;
    visited.add(fileKey);

    const fd = await loadFileData(file);
    if (!fd) continue;

    const lbl = fd.labels.get(exported);
    if (lbl) result.set(local, lbl);

    // @illusion: recurse_sub_imports -> follows transitive imports -> builds deeper labels
    if (depth < maxDepth && fd.imports.size > 0) {
      await resolveExternalLabelsRecursive(fd.imports, depth + 1, maxDepth, visited, result);
    }
  }
}

// @illusion: resolve_external_labels -> resolves imported names -> their @illusion labels (recursive)
export async function resolveExternalLabels(
  importMap: Map<string, ImportRef>,
  maxDepth: number = 2
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const visited = new Set<string>();
  await resolveExternalLabelsRecursive(importMap, 0, maxDepth, visited, result);
  return result;
}
