import * as vscode from 'vscode';
import { openViewCommand } from './commands/openView';
import { checkCoverageCommand } from './commands/checkCoverage';
import { scaffoldCommand } from './commands/scaffold';
import { initRulesCommand } from './commands/initRules';
import { analyzeEditor, getActiveEditor } from './commands/util';
import { showDeclutteredView, isPanelOpen } from './webview/panel';

let debounceTimer: NodeJS.Timeout | null = null;

// @preserve @illusion: safe -> wraps promise -> catches -> shows error message
function safe(p: Promise<unknown>): void {
  p.catch((e) => {
    const msg = e && e.message ? e.message : String(e);
    vscode.window.showErrorMessage('Code Illusion: ' + msg);
  });
}

// @preserve @illusion: activate -> registers commands -> sets up live refresh on editor change
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeIllusion.openView', () => safe(openViewCommand(context))),
    vscode.commands.registerCommand('codeIllusion.checkCoverage', () => safe(checkCoverageCommand())),
    vscode.commands.registerCommand('codeIllusion.scaffold', (arg?: unknown) =>
      safe(scaffoldCommand(arg as { uri?: vscode.Uri; line?: number }))
    ),
    vscode.commands.registerCommand('codeIllusion.initRules', () => safe(initRulesCommand(context)))
  );

  // @preserve @illusion: refresh -> debounces -> re-analyzes editor -> updates panel
  const refresh = (): void => {
    if (!isPanelOpen()) {
      return;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      safe(
        (async () => {
          const editor = getActiveEditor();
          const result = await analyzeEditor(editor);
          showDeclutteredView(context, editor, result);
        })()
      );
    }, 300);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(refresh),
    vscode.workspace.onDidChangeTextDocument((_e) => {
      if (isPanelOpen()) {
        refresh();
      }
    })
  );
}

// @preserve @illusion: deactivate -> clears debounce timer on shutdown
export function deactivate(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
}
