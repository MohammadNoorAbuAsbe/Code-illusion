export interface TSPosition {
  row: number;
  column: number;
}

export interface TSNode {
  type: string;
  text: string;
  startPosition: TSPosition;
  endPosition: TSPosition;
  children: TSNode[];
  parent: TSNode | null;
  childForFieldName(name: string): TSNode | null;
}

export type CommentStyle = { kind: 'line'; token: string } | { kind: 'html'; open: string; close: string };

export interface LanguageConfig {
  grammar: string;
  comment: CommentStyle;
  highlight: string;
  narrativeDepth?: number;
}

export interface Card {
  id: string;
  filePath?: string;
  startLine: number;
  endLine: number;
  kind: string;
  name: string | null;
  label: string | null;
  code: string;
  calls: string[];
  narrative: string | null;
}

export interface BlockDescriptor {
  node: TSNode;
  kind: string;
  name: string | null;
}

export interface BlockInfo {
  node: TSNode;
  cardId: string;
  name: string | null;
  kind: string;
}

export interface CallGraphEdge {
  callerCardId: string;
  calleeCardId: string;
  calleeName: string;
  external?: boolean;
}

export interface ExternalCard {
  name: string;
  label: string;
}

export interface BuildCallGraphResult {
  edges: CallGraphEdge[];
  entryPointIds: string[];
  externalCards: Map<string, ExternalCard>;
}

export type BlockPredicate = (n: TSNode) => boolean;

export interface AnalysisResult {
  language: string;
  grammarUsed: boolean;
  source: string;
  cards: Card[];
  executionFlow: string;
  note?: string;
}
