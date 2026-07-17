import * as vscode from 'vscode';
import { AnalysisResult } from '../core/types';
import { analyzeDocument } from '../core/annotations';

// @preserve @illusion: get_active_editor -> gets editor or throws
export function getActiveEditor(): vscode.TextEditor {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error('No active editor. Open a file first.');
  }
  return editor;
}

// @preserve @illusion: analyze_editor -> reads document -> delegates to analyzeDocument
export async function analyzeEditor(editor: vscode.TextEditor): Promise<AnalysisResult> {
  const doc = editor.document;
  return analyzeDocument(doc.getText(), doc.languageId);
}
