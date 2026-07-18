import { LanguageConfig } from './types';
import * as path from 'path';

// @preserve @illusion: mk_line_comment -> returns line comment config from token
const LINE = (token: string): LanguageConfig['comment'] => ({ kind: 'line', token });

export const LANGUAGES: Record<string, LanguageConfig> = {
  javascript: { grammar: 'javascript', comment: LINE('//'), highlight: 'javascript' },
  typescript: { grammar: 'typescript', comment: LINE('//'), highlight: 'typescript' },
  javascriptreact: { grammar: 'tsx', comment: LINE('//'), highlight: 'javascript' },
  typescriptreact: { grammar: 'tsx', comment: LINE('//'), highlight: 'typescript' },
  python: { grammar: 'python', comment: LINE('#'), highlight: 'python' },
  java: { grammar: 'java', comment: LINE('//'), highlight: 'java' },
  csharp: { grammar: 'c-sharp', comment: LINE('//'), highlight: 'csharp' },
  go: { grammar: 'go', comment: LINE('//'), highlight: 'go' },
  rust: { grammar: 'rust', comment: LINE('//'), highlight: 'rust' },
  // Fallback comment style for the regex path (used when no grammar is available)
  _default: { grammar: '', comment: LINE('//'), highlight: 'plaintext' }
};

// @preserve @illusion: get_language_config -> looks up language -> returns config or null
export function getLanguageConfig(languageId: string): LanguageConfig | null {
  return LANGUAGES[languageId] ?? null;
}

// @preserve @illusion: highlight_id -> looks up highlight id -> falls back to plaintext
export function highlightId(languageId: string): string {
  return LANGUAGES[languageId]?.highlight ?? 'plaintext';
}

const EXT_TO_LANGUAGE: Record<string, string> = {
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.jsx': 'javascriptreact',
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.py': 'python',
  '.java': 'java',
  '.cs': 'csharp',
  '.go': 'go',
  '.rs': 'rust',
  '.html': 'html', '.htm': 'html',
};

// @preserve @illusion: language_id_from_path -> maps file extension -> supported language id or null
export function languageIdFromPath(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_LANGUAGE[ext] ?? null;
}
