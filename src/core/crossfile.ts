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

// @illusion: extract_imports -> walks import declarations -> maps local name -> {file, exported}
export function extractImports(tree: { rootNode: TSNode }, sourceDir: string): Map<string, ImportRef> {
  const result = new Map<string, ImportRef>();

  const visit = (n: TSNode) => {
    if (n.type === 'import_statement' || n.type === 'import_declaration') {
      const srcNode = n.childForFieldName('source');
      if (srcNode) {
        const spec = srcNode.text.replace(/^['"]|['"]$/g, '');
        if (spec.startsWith('.')) {
          const abs = path.resolve(sourceDir, spec);
          // import_specifier nodes live nested under import_clause -> named_imports.
          const collect = (node: TSNode) => {
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
    for (const c of n.children) visit(c);
  };

  visit(tree.rootNode);
  return result;
}

// Cache of parsed-target-file name -> @illusion label maps, keyed by path + mtime.
const labelCache = new Map<string, Map<string, string>>();

// @illusion: load_file_labels -> parses one target file -> maps exported fn name -> @illusion label
async function loadFileLabels(file: string): Promise<Map<string, string> | null> {
  const lang = languageIdFromPath(file);
  if (!lang) return null;
  const cfg = getLanguageConfig(lang);
  if (!cfg || !cfg.grammar) return null;

  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }

  const cacheKey = `${file}:${stat.mtimeMs}`;
  const cached = labelCache.get(cacheKey);
  if (cached) return cached;

  let src: string;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }

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
    labelCache.set(cacheKey, labels);
    return labels;
  } catch {
    return null;
  }
}

// @illusion: resolve_external_labels -> resolves imported names -> their @illusion labels (one level)
export async function resolveExternalLabels(importMap: Map<string, ImportRef>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const fileCache = new Map<string, Map<string, string> | null>();

  for (const [local, { file, exported }] of importMap) {
    if (out.has(local)) continue;
    try {
      let labels = fileCache.get(file);
      if (labels === undefined) {
        labels = await loadFileLabels(file);
        fileCache.set(file, labels);
      }
      const lbl = labels?.get(exported);
      if (lbl) out.set(local, lbl);
    } catch {
      // Skip unresolvable imports gracefully.
    }
  }

  return out;
}
