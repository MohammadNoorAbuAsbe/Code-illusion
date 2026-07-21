import * as vscode from 'vscode';
import { analyzeEditor, getActiveEditor } from './util';
import { scaffoldProposals } from '../core/scaffold';

interface ScaffoldArg {
  uri?: vscode.Uri;
  line?: number;
}

// @illusion: scaffold_command -> analyzes editor -> filters missing -> inserts placeholders bottom-up
export async function scaffoldCommand(arg?: ScaffoldArg): Promise<void> {
  let editor: vscode.TextEditor;
  if (arg && arg.uri) {
    const doc = await vscode.workspace.openTextDocument(arg.uri);
    editor = await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.One,
      preserveFocus: true,
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

  const proposals = scaffoldProposals(doc.getText(), targets, doc.languageId);

  const edit = new vscode.WorkspaceEdit();
  // @illusion: insert_placeholders -> iterate proposals -> build edit inserts -> apply
  for (const p of proposals) {
    edit.insert(doc.uri, new vscode.Position(p.line - 1, 0), p.snippet + '\n');
  }

  await vscode.workspace.applyEdit(edit);
  vscode.window.showInformationMessage(
    `Code Illusion: scaffolded ${targets.length} annotation(s). Replace the TODO text with a real summary.`
  );
}
