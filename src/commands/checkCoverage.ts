import * as vscode from 'vscode';
import { analyzeEditor, getActiveEditor } from './util';

let collection: vscode.DiagnosticCollection | null = null;
// @preserve @illusion: check_coverage_command -> analyzes editor -> creates diagnostics for missing annotations
export async function checkCoverageCommand(): Promise<void> {
  const editor = getActiveEditor();
  const doc = editor.document;
  const result = await analyzeEditor(editor);

  if (!collection) {
    collection = vscode.languages.createDiagnosticCollection('codeIllusion');
  }

  const diags: vscode.Diagnostic[] = [];
  let missing = 0;
  // @preserve @illusion: build_diagnostics -> iterate cards -> create hint for each missing annotation
  for (const c of result.cards) {
    if (c.label == null) {
      missing++;
      const range = new vscode.Range(c.startLine - 1, 0, c.endLine, 0);
      const name = c.name ? ` "${c.name}"` : '';
      const d = new vscode.Diagnostic(
        range,
        `Missing @illusion annotation for ${c.kind}${name}`,
        vscode.DiagnosticSeverity.Hint
      );
      d.code = 'codeIllusion.missing';
      diags.push(d);
    }
  }
  collection.set(doc.uri, diags);

  if (missing === 0) {
    vscode.window.showInformationMessage('Code Illusion: 100% annotated 🎉');
  } else {
    vscode.window.showWarningMessage(
      `Code Illusion: ${missing} block(s) missing @illusion annotations (see Problems).`
    );
  }
}
