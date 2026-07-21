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
import { analyzeDocument } from './core/annotations';
import { languageIdFromPath } from './core/languages';

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

// @illusion: jump_to_next_missing -> finds next unannotated block -> reveals it in editor
async function jumpToNextMissing(): Promise<void> {
  const editor = getActiveEditor();
  const doc = editor.document;
  const source = doc.getText();
  const languageId = languageIdFromPath(doc.fileName);
  if (!languageId) {
    vscode.window.showInformationMessage('Code Illusion: unsupported language');
    return;
  }
  const result = await analyzeDocument(source, languageId, doc.fileName);
  const missing = result.cards.filter((c) => c.label == null).sort((a, b) => a.startLine - b.startLine);
  if (missing.length === 0) {
    vscode.window.showInformationMessage('Code Illusion: no missing annotations');
    return;
  }
  const cursorLine = editor.selection.active.line + 1;
  const nextMissing = missing.find((m) => m.startLine > cursorLine) ?? missing[0];
  const pos = new vscode.Position(nextMissing.startLine - 1, 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
}

// @illusion: activate -> registers commands -> schedules artifact gen -> sets up live refresh on editor + save
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeIllusion.openView', () => safe(openViewCommand(context))),
    vscode.commands.registerCommand('codeIllusion.openProjectView', () => safe(openProjectStoryCommand(context))),
    vscode.commands.registerCommand('codeIllusion.checkCoverage', () => safe(checkCoverageCommand())),
    vscode.commands.registerCommand('codeIllusion.scaffold', (arg?: unknown) =>
      safe(scaffoldCommand(arg as { uri?: vscode.Uri; line?: number }))
    ),
    vscode.commands.registerCommand('codeIllusion.jumpNextMissing', () => safe(jumpToNextMissing())),
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
