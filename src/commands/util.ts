import * as vscode from 'vscode';
import { AnalysisResult } from '../core/types';
import { analyzeDocument } from '../core/annotations';

// @illusion: get_active_editor -> gets editor or throws
export function getActiveEditor(): vscode.TextEditor {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error('No active editor. Open a file first.');
  }
  return editor;
}

// @illusion: analyze_editor -> reads document -> forwards narrativeDepth setting
export async function analyzeEditor(editor: vscode.TextEditor): Promise<AnalysisResult> {
  const doc = editor.document;
  const depth = vscode.workspace.getConfiguration('codeIllusion').get<number>('narrativeDepth');
  return analyzeDocument(doc.getText(), doc.languageId, doc.uri.fsPath, { narrativeDepth: depth });
}
