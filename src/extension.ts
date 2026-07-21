import * as vscode from 'vscode';
import * as path from 'path';
import { openViewCommand } from './commands/openView';
import { openProjectStoryCommand } from './commands/openProjectStory';
import { checkCoverageCommand } from './commands/checkCoverage';
import { scaffoldCommand } from './commands/scaffold';
import { initRulesCommand } from './commands/initRules';
import { analyzeEditor, getActiveEditor } from './commands/util';
import { showDeclutteredView, isPanelOpen } from './webview/panel';
import { analyzeProject, resolveInputs } from './core/project';
import { buildArtifacts, writeArtifacts, writeGitignore } from './core/export';

let debounceTimer: NodeJS.Timeout | null = null;
let artifactGenTimer: NodeJS.Timeout | null = null;

// @illusion: safe -> wraps promise -> catches -> shows error message
function safe(p: Promise<unknown>): void {
  p.catch((e) => {
    const msg = e && e.message ? e.message : String(e);
    vscode.window.showErrorMessage('Code Illusion: ' + msg);
  });
}

// @illusion: get_auto_gen_setting -> reads user setting -> defaults to true
function getAutoGenSetting(): boolean {
  return vscode.workspace.getConfiguration('codeIllusion').get('autoGenerateArtifacts', true);
}

// @illusion: generate_artifacts -> scans workspace -> runs analyzeProject -> writes code-illusion-out/
async function generateArtifacts(): Promise<void> {
  if (!getAutoGenSetting()) return;

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return;

  const root = folders[0].uri.fsPath;
  const files = resolveInputs([root]);
  if (files.length === 0) return;

  const pa = await analyzeProject(files, { narrativeDepth: 2 });
  const artifacts = buildArtifacts({
    files: pa.files,
    allCards: pa.allCards,
    edges: pa.edges,
    entryPointIds: pa.entryPointIds,
    executionFlow: pa.executionFlow,
  });
  writeArtifacts(artifacts);
  writeGitignore();
}

// @illusion: schedule_gen -> debounces artifact regeneration -> waits for idle then runs
function scheduleGen(delay = 2000): void {
  if (!getAutoGenSetting()) return;
  if (artifactGenTimer) clearTimeout(artifactGenTimer);
  artifactGenTimer = setTimeout(() => safe(generateArtifacts()), delay);
}

const SUPPORTED_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.cs', '.go', '.rs',
]);

// @illusion: activate -> registers commands -> schedules artifact gen -> sets up live refresh on editor + save
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeIllusion.openView', () => safe(openViewCommand(context))),
    vscode.commands.registerCommand('codeIllusion.openProjectView', () => safe(openProjectStoryCommand(context))),
    vscode.commands.registerCommand('codeIllusion.checkCoverage', () => safe(checkCoverageCommand())),
    vscode.commands.registerCommand('codeIllusion.scaffold', (arg?: unknown) =>
      safe(scaffoldCommand(arg as { uri?: vscode.Uri; line?: number }))
    ),
    vscode.commands.registerCommand('codeIllusion.initRules', () => safe(initRulesCommand(context))),
    vscode.commands.registerCommand('codeIllusion.initRulesForce', () => safe(initRulesCommand(context, true)))
  );

  // @illusion: auto_gen_on_startup -> waits 2s after activation -> generates code-illusion-out/ artifacts
  scheduleGen(2000);

  // @illusion: refresh -> debounces -> re-analyzes editor -> updates panel
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
    }),
    // @illusion: on_save_regenerate -> when a supported source file is saved -> re-generates artifacts
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const ext = path.extname(doc.fileName).toLowerCase();
      if (SUPPORTED_EXT.has(ext)) scheduleGen(2000);
    })
  );
}

// @illusion: deactivate -> clears both debounce timers on shutdown
export function deactivate(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (artifactGenTimer) clearTimeout(artifactGenTimer);
}
