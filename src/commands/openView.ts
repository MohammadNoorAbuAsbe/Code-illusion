import * as vscode from 'vscode';
import { analyzeEditor, getActiveEditor } from './util';
import { showDeclutteredView } from '../webview/panel';

// @preserve @illusion: open_view_command -> analyzes active editor -> shows de-cluttered panel
export async function openViewCommand(context: vscode.ExtensionContext): Promise<void> {
  const editor = getActiveEditor();
  const result = await analyzeEditor(editor);
  showDeclutteredView(context, editor, result);
}
