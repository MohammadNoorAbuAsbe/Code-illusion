import * as vscode from 'vscode';
import { analyzeEditor, getActiveEditor } from './util';
import { getLanguageConfig } from '../core/languages';
import { Card } from '../core/types';

interface ScaffoldArg {
  uri?: vscode.Uri;
  line?: number;
}

// @preserve @illusion: build_comment -> formats comment string for language comment style
function buildComment(docLang: string, text: string): string {
  const config = getLanguageConfig(docLang);
  const style = config?.comment ?? { kind: 'line', token: '//' };
  if (style.kind === 'html') {
    return `${style.open} @illusion: ${text} ${style.close}\n`;
  }
  return `${style.token} @illusion: ${text}\n`;
}

// @preserve @illusion: placeholder -> generates <TODO: describe name (kind)> from Card
function placeholder(t: Card): string {
  const name = t.name ? ` ${t.name}` : '';
  return `<TODO: describe${name} (${t.kind})>`;
}

// @preserve @illusion: scaffold_command -> analyzes editor -> filters missing -> inserts placeholders bottom-up
export async function scaffoldCommand(arg?: ScaffoldArg): Promise<void> {
  let editor: vscode.TextEditor;
  if (arg && arg.uri) {
    const doc = await vscode.workspace.openTextDocument(arg.uri);
    editor = await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.One,
      preserveFocus: true
    });
  } else {
    editor = getActiveEditor();
  }

  const doc = editor.document;
  const result = await analyzeEditor(editor);

  let targets = result.cards.filter((c) => c.label == null);
  if (arg && typeof arg.line === 'number') {
    targets = targets.filter(
      (c) => c.startLine === arg.line || ((arg.line as number) >= c.startLine && (arg.line as number) <= c.endLine)
    );
  }

  if (targets.length === 0) {
    vscode.window.showInformationMessage('Code Illusion: nothing to scaffold (no missing annotations).');
    return;
  }

  // Insert from bottom to top so earlier line numbers stay valid.
  targets.sort((a, b) => b.startLine - a.startLine);

  const edit = new vscode.WorkspaceEdit();
  // @preserve @illusion: insert_placeholders -> iterate targets -> build edit inserts -> apply
  for (const t of targets) {
    const lineText = doc.lineAt(t.startLine - 1).text;
    const indent = lineText.match(/^\s*/)?.[0] ?? '';
    const comment = indent + buildComment(doc.languageId, placeholder(t));
    edit.insert(doc.uri, new vscode.Position(t.startLine - 1, 0), comment);
  }

  await vscode.workspace.applyEdit(edit);
  vscode.window.showInformationMessage(
    `Code Illusion: scaffolded ${targets.length} annotation(s). Replace the TODO text with a real summary.`
  );
}
