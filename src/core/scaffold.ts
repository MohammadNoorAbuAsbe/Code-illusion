import { Card } from './types';
import { getLanguageConfig } from './languages';

export interface ScaffoldProposal {
  line: number;
  snippet: string;
}

// @illusion: placeholder_text -> builds the @illusion placeholder comment for a block + language
export function placeholderText(card: Card, languageId: string): string {
  const config = getLanguageConfig(languageId);
  const style = config?.comment ?? { kind: 'line', token: '//' };
  const name = card.name ? ` ${card.name}` : '';
  const body = `<TODO: describe${name} (${card.kind})>`;
  if (style.kind === 'html') {
    return `${style.open} @illusion: ${body} ${style.close}`;
  }
  return `${style.token} @illusion: ${body}`;
}

// @illusion: scaffold_proposals -> finds unannotated blocks -> returns indented placeholder insertions
export function scaffoldProposals(source: string, cards: Card[], languageId: string): ScaffoldProposal[] {
  const lines = source.split('\n');
  const missing = cards.filter((c) => c.label == null);
  missing.sort((a, b) => b.startLine - a.startLine);
  const proposals: ScaffoldProposal[] = [];
  // @illusion: make_proposals -> walks missing cards -> builds indented placeholder snippet
  for (const card of missing) {
    const lineText = lines[card.startLine - 1] ?? '';
    const indent = lineText.match(/^\s*/)?.[0] ?? '';
    proposals.push({ line: card.startLine, snippet: indent + placeholderText(card, languageId) });
  }
  return proposals;
}
