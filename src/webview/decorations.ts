import * as vscode from 'vscode';
import { Card } from '../core/types';

let annDecoration: vscode.TextEditorDecorationType | undefined;
let missDecoration: vscode.TextEditorDecorationType | undefined;

// @illusion: ensure_decoration_types -> creates ann + miss decoration types once
function ensureDecorationTypes(): void {
  if (!annDecoration) {
    annDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: 'rgba(80, 200, 120, 0.12)',
      borderColor: 'rgba(46, 77, 46, 0.9)',
      borderStyle: 'solid',
      borderWidth: '0 0 0 2px',
      overviewRulerColor: 'rgba(80, 200, 120, 0.5)',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
  }
  if (!missDecoration) {
    missDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: 'rgba(220, 150, 60, 0.14)',
      borderColor: 'rgba(90, 58, 26, 0.9)',
      borderStyle: 'solid',
      borderWidth: '0 0 0 2px',
      overviewRulerColor: 'rgba(220, 150, 60, 0.5)',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
  }
}

// @illusion: cards_to_ranges -> maps cards to ann/miss whole-line ranges
function cardsToRanges(cards: Card[]): { ann: vscode.Range[]; miss: vscode.Range[] } {
  const ann: vscode.Range[] = [];
  const miss: vscode.Range[] = [];
  // @illusion: range_cards -> walks cards -> maps to ann/miss whole-line ranges
  for (const card of cards) {
    const start = Math.max(0, card.startLine - 1);
    const end = Math.max(start, card.endLine - 1);
    const range = new vscode.Range(start, 0, end, 0);
    if (card.label == null) {
      miss.push(range);
    } else {
      ann.push(range);
    }
  }
  return { ann, miss };
}

// @illusion: apply_decorations -> paints ann/miss markers on the active editor
export function applyDecorations(editor: vscode.TextEditor, cards: Card[]): void {
  ensureDecorationTypes();
  const { ann, miss } = cardsToRanges(cards);
  editor.setDecorations(annDecoration!, ann);
  editor.setDecorations(missDecoration!, miss);
}

// @illusion: clear_decorations -> removes markers from the editor
export function clearDecorations(editor: vscode.TextEditor): void {
  if (annDecoration) editor.setDecorations(annDecoration, []);
  if (missDecoration) editor.setDecorations(missDecoration, []);
}
