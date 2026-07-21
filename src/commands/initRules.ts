import * as path from 'path';
import * as vscode from 'vscode';
import { installPlatform, allPlatforms } from './installRules';

// @illusion: init_rules_command -> delegates to shared installRules -> shows VS Code messages
export async function initRulesCommand(
  _context: vscode.ExtensionContext,
  force = false
): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage('Code Illusion: open a workspace/folder first.');
    return;
  }
  const root = folders[0].uri.fsPath;

  const allResults = allPlatforms().map((p) => installPlatform(p.name, root, force));
  const allWritten = allResults.flatMap((r) => r.filesWritten);
  const allErrors = allResults.flatMap((r) => r.errors);

  if (allWritten.length) {
    const relPaths = allWritten.map((w) => w.replace(root + path.sep, ''));
    vscode.window.showInformationMessage(
      `Code Illusion: wrote agent rules -> ${relPaths.join(', ')}. Agents will now annotate with @illusion.`
    );
  }
  if (allErrors.length) {
    const skipped = allErrors.filter((e) => e.startsWith('Already exists'));
    if (skipped.length) {
      vscode.window.showWarningMessage(
        `Code Illusion: skipped existing files (${skipped.length}). Run "Init Agent Rules (Overwrite)" to regenerate.`
      );
    }
  }
  if (!allWritten.length && !allErrors.length) {
    vscode.window.showWarningMessage('Code Illusion: no rule templates available.');
  }
}
